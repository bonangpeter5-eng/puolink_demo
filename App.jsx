import { useCallback, useEffect, useRef, useState } from 'react';
import VideoCall from './components/VideoCall.jsx';
import LiveTranscript from './components/LiveTranscript.jsx';
import AccessibilityControls from './components/AccessibilityControls.jsx';
import SignLanguageDetector from './components/SignLanguageDetector.jsx';

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || '/api';
const BACKEND_REQUEST_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
  });
}

function App() {
  const [roomUrl, setRoomUrl] = useState(null);
  const [patientToken, setPatientToken] = useState(null);
  const [deepgramToken, setDeepgramToken] = useState(null);
  const [activeAudioTrack, setActiveAudioTrack] = useState(null);
  const [visitStarted, setVisitStarted] = useState(false);
  const [isStartingVisit, setIsStartingVisit] = useState(false);
  const [showWelcomeLayer, setShowWelcomeLayer] = useState(true);
  const [selectedMode, setSelectedMode] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [highContrast, setHighContrast] = useState(true);
  const [permissionState, setPermissionState] = useState('unknown');
  const [cameraDevices, setCameraDevices] = useState([]);
  const [microphoneDevices, setMicrophoneDevices] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMicrophone, setSelectedMicrophone] = useState('');

  const [backendStatus, setBackendStatus] = useState('connecting');
  const [backendError, setBackendError] = useState(null);
  const isMountedRef = useRef(true);

  const requestDevicePermissions = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('This browser does not support camera/microphone access.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
      setPermissionState('granted');
    } catch (permissionError) {
      console.error('[App] Permission request failed:', permissionError);
      setPermissionState('denied');
    }
  }, []);

  const connectToBackend = useCallback(async () => {
    setBackendStatus('connecting');
    setBackendError(null);
    setIsStartingVisit(true);

    let sessionPayload;
    try {
      const sessionResponse = await fetchWithTimeout(
        `${API_BASE_URL}/presence-session`,
        { method: 'POST' },
        BACKEND_REQUEST_TIMEOUT_MS
      );
      if (!sessionResponse.ok) {
        throw new Error(`Backend returned HTTP ${sessionResponse.status} for presence-session.`);
      }
      sessionPayload = await sessionResponse.json();
    } catch (sessionRequestError) {
      if (!isMountedRef.current) return;
      const friendlyMessage =
        sessionRequestError.name === 'AbortError'
          ? 'The backend took too long to respond. It may be starting up or unreachable.'
          : 'Could not reach the video backend. Is the Java server running on port 8080?';
      console.error('[App] presence-session request failed:', sessionRequestError);
      setBackendError(friendlyMessage);
      setBackendStatus('error');
      setIsStartingVisit(false);
      return;
    }

    let deepgramPayload;
    try {
      const deepgramResponse = await fetchWithTimeout(
        `${API_BASE_URL}/deepgram-token`,
        undefined,
        BACKEND_REQUEST_TIMEOUT_MS
      );
      if (!deepgramResponse.ok) {
        throw new Error(`Backend returned HTTP ${deepgramResponse.status} for deepgram-token.`);
      }
      deepgramPayload = await deepgramResponse.json();
    } catch (deepgramRequestError) {
      if (!isMountedRef.current) return;
      console.error('[App] deepgram-token request failed:', deepgramRequestError);
      setRoomUrl(sessionPayload?.roomUrl ?? null);
      setPatientToken(sessionPayload?.patientToken ?? null);
      setBackendError('Video connected, but live captions could not start.');
      setBackendStatus('error');
      setIsStartingVisit(false);
      return;
    }

    if (!isMountedRef.current) return;
    setRoomUrl(sessionPayload?.roomUrl ?? null);
    setPatientToken(sessionPayload?.patientToken ?? null);
    setDeepgramToken(deepgramPayload?.key ?? null);
    setBackendStatus('ready');
    setVisitStarted(true);
    setIsStartingVisit(false);
  }, []);

  const handleWelcomeContinue = useCallback(() => {
    if (!selectedMode || !selectedLanguage) return;
    setShowWelcomeLayer(false);
  }, [selectedLanguage, selectedMode]);

  const startVisit = useCallback(async () => {
    await requestDevicePermissions();
    await connectToBackend();
  }, [connectToBackend, requestDevicePermissions]);

  useEffect(() => {
    isMountedRef.current = true;
    requestDevicePermissions();

    return () => {
      isMountedRef.current = false;
    };
  }, [requestDevicePermissions]);

  useEffect(() => {
    async function loadDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) return;

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((device) => device.kind === 'videoinput');
        const microphones = devices.filter((device) => device.kind === 'audioinput');

        setCameraDevices(cameras);
        setMicrophoneDevices(microphones);

        if (cameras[0] && !selectedCamera) {
          setSelectedCamera(cameras[0].deviceId || 'default');
        }
        if (microphones[0] && !selectedMicrophone) {
          setSelectedMicrophone(microphones[0].deviceId || 'default');
        }
      } catch (deviceError) {
        console.warn('[App] Unable to list media devices:', deviceError);
      }
    }

    loadDevices();
  }, [selectedCamera, selectedMicrophone]);

  const handleLocalMediaState = useCallback(({ micOn, cameraOn }) => {
    setIsMicOn(Boolean(micOn));
    setIsCameraOn(Boolean(cameraOn));
  }, []);

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <h1>PUOLINK</h1>
        <p>A clear line of sight and sound with your care team</p>
      </header>

      {showWelcomeLayer && (
        <div className="welcome-layer" aria-live="polite">
          <div className="welcome-card">
            <p className="welcome-card__eyebrow">Welcome</p>
            <h2>PUOLINK</h2>

            <div className="selection-group">
              <span className="selection-group__label">Select mode</span>
              <div className="option-row">
                {['Hard hearing', 'Sign language'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`option-button ${selectedMode === mode ? 'option-button--selected' : ''}`}
                    onClick={() => setSelectedMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="selection-group">
              <span className="selection-group__label">Select language</span>
              <div className="option-row">
                {['English', 'Setswana'].map((language) => (
                  <button
                    key={language}
                    type="button"
                    className={`option-button ${selectedLanguage === language ? 'option-button--selected' : ''}`}
                    onClick={() => setSelectedLanguage(language)}
                  >
                    {language}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="welcome-card__continue"
              onClick={handleWelcomeContinue}
              disabled={!selectedMode || !selectedLanguage}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {!visitStarted && !showWelcomeLayer && (
        <div className="visit-launcher" aria-live="polite">
          <button type="button" className="visit-launcher__button" onClick={startVisit} disabled={isStartingVisit}>
            {isStartingVisit ? 'Starting Visit...' : 'Start Visit'}
          </button>
        </div>
      )}

      {backendStatus === 'connecting' && visitStarted && (
        <div className="app-shell__status" role="status">
          Connecting to your secure visit...
        </div>
      )}

      {backendError && (
        <div className="app-shell__status app-shell__status--error" role="alert">
          <p>{backendError}</p>
          <button type="button" onClick={startVisit} className="app-shell__start-button">
            Retry connection
          </button>
        </div>
      )}

      <main className="app-shell__main">
        {selectedMode === 'Sign language' && (
          <SignLanguageDetector enabled={selectedMode === 'Sign language'} selectedLanguage={selectedLanguage} />
        )}

        <div className="app-shell__video-column">
          <div className="video-call-wrapper" aria-label="Video call with your healthcare provider">
            {visitStarted && roomUrl ? (
              <VideoCall
                roomUrl={roomUrl}
                token={patientToken}
                isMicOn={isMicOn}
                isCameraOn={isCameraOn}
                onRemoteAudioTrack={setActiveAudioTrack}
                onLocalMediaState={handleLocalMediaState}
              />
            ) : (
              <div className="video-call-placeholder" role="status">
                <p>Waiting for provider...</p>
              </div>
            )}

            {visitStarted && <div className="patient-pip" aria-label="You (Patient)"><span>You (Patient)</span></div>}
          </div>

          <div className="call-toolbar" aria-label="Call controls">
            <button
              type="button"
              className={`call-toolbar__button call-toolbar__button--green ${!isMicOn ? 'is-muted' : ''}`}
              onClick={() => setIsMicOn((previous) => !previous)}
            >
              {isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
            </button>

            <div className="audio-wave" aria-label="Microphone activity">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>

            <button
              type="button"
              className={`call-toolbar__button call-toolbar__button--blue ${!isCameraOn ? 'is-off' : ''}`}
              onClick={() => setIsCameraOn((previous) => !previous)}
            >
              Toggle Video Camera
            </button>

            <button type="button" className="call-toolbar__button call-toolbar__button--red">
              Leave Call
            </button>
          </div>

          <div className="device-row" aria-label="Hardware selection">
            <div className="device-field">
              <label htmlFor="camera-select">Select Camera</label>
              <select id="camera-select" value={selectedCamera} onChange={(event) => setSelectedCamera(event.target.value)}>
                {cameraDevices.length === 0 ? (
                  <option value="">Default Camera</option>
                ) : (
                  cameraDevices.map((device) => (
                    <option key={device.deviceId || 'camera-default'} value={device.deviceId || 'default'}>
                      {device.label || 'Camera'}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="device-field">
              <label htmlFor="microphone-select">Select Microphone</label>
              <select id="microphone-select" value={selectedMicrophone} onChange={(event) => setSelectedMicrophone(event.target.value)}>
                {microphoneDevices.length === 0 ? (
                  <option value="">Default Microphone</option>
                ) : (
                  microphoneDevices.map((device) => (
                    <option key={device.deviceId || 'mic-default'} value={device.deviceId || 'default'}>
                      {device.label || 'Microphone'}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button type="button" className="settings-button" aria-label="Open settings">
              ⚙
            </button>
          </div>

          <AccessibilityControls
            isMicOn={isMicOn}
            isCameraOn={isCameraOn}
            highContrast={highContrast}
            onToggleMic={() => setIsMicOn((previous) => !previous)}
            onToggleCamera={() => setIsCameraOn((previous) => !previous)}
            onToggleHighContrast={() => setHighContrast((previous) => !previous)}
            permissionState={permissionState}
            onRequestPermissions={requestDevicePermissions}
          />
        </div>

        <div className="app-shell__transcript-column">
          {deepgramToken && activeAudioTrack ? (
            <LiveTranscript
              audioTrack={activeAudioTrack}
              deepgramToken={deepgramToken}
              highContrast={highContrast}
            />
          ) : (
            <section
              className={`live-transcript ${highContrast ? 'live-transcript--high-contrast' : ''}`}
              aria-label="Live captions of the conversation"
            >
              <header className="live-transcript__header">
                <h2>Live Captions</h2>
              </header>
              <div className="live-transcript__body">
                <p className="live-transcript__placeholder">
                  {!deepgramToken
                    ? 'Captions will appear here once connected.'
                    : 'Captions will start once your provider joins and speaks.'}
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
