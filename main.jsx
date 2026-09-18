import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './styles/accessibility.css';
import './App.css';

/**
 * Writes a visible error message into the page, bypassing React entirely.
 * This is the one function every failure path below funnels into, so
 * there is exactly one way an error becomes visible instead of several
 * half-consistent ones.
 */
function showFatalError(title, detail) {
  const target = document.body || document.documentElement;
  if (!target) {
    // Truly nothing to render into — last resort is the console.
    // eslint-disable-next-line no-console
    console.error('[Puolink]', title, detail);
    return;
  }

  const rootElement = document.getElementById('root');
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'margin:24px;padding:20px;background:#7f1d1d;color:#fff;border-radius:12px;' +
    'font-family:Segoe UI,Roboto,sans-serif;line-height:1.6;white-space:pre-line;' +
    'max-width:700px;';
  banner.textContent = title + (detail ? '\n\n' + detail : '');

  if (rootElement) {
    // Replace the "Loading..." placeholder rather than stacking on top of it.
    rootElement.replaceChildren(banner);
  } else {
    target.prepend(banner);
  }
}

// ---------------------------------------------------------------------
// Global safety net: catches errors even if they happen OUTSIDE React's
// render cycle (e.g. top-level code in a module that throws on import,
// or a startup fetch whose rejection nothing else awaits). These fire
// instantly, before React ever gets a chance to run, which is exactly
// the "typo in App.jsx" / "broken fetch at startup" case that otherwise
// shows nothing but a blank white page.
//
// Important distinction: window.onerror only fires for synchronous
// thrown errors. It does NOT fire for a rejected Promise (e.g. an
// `await fetch(...)` that fails) — that needs the separate
// 'unhandledrejection' event, which is why both are wired up here.
// ---------------------------------------------------------------------
window.onerror = function handleGlobalError(message, source, lineno, colno, error) {
  // eslint-disable-next-line no-console
  console.error('[Puolink] Uncaught error:', error || message, { source, lineno, colno });
  showFatalError(
    'Puolink hit an error before it could finish loading.',
    (error && error.message ? error.message : String(message)) +
      '\n\nOpen your browser console (F12) for the full stack trace.'
  );
  // Returning true suppresses the browser's own default error logging;
  // we deliberately return false so the original error still shows up
  // in the console with its full stack trace, in addition to our banner.
  return false;
};

window.addEventListener('unhandledrejection', function handleUnhandledRejection(event) {
  const reason = event.reason;
  // eslint-disable-next-line no-console
  console.error('[Puolink] Unhandled promise rejection:', reason);
  showFatalError(
    'Puolink hit an error before it could finish loading.',
    (reason && reason.message ? reason.message : String(reason)) +
      '\n\nOpen your browser console (F12) for the full stack trace.'
  );
});

// ---------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------
const rootElement = document.getElementById('root');

if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  } catch (mountError) {
    // Synchronous failure inside createRoot/render itself — this is
    // BEFORE React has mounted anything, so an ErrorBoundary (which only
    // protects an already-mounted tree) cannot catch it. window.onerror
    // also will not catch this, because it's caught right here instead
    // of being left to propagate. Handle it explicitly.
    // eslint-disable-next-line no-console
    console.error('[Puolink] Failed to mount the React app:', mountError);
    showFatalError('Puolink failed to start.', mountError.message);
  }
} else {
  showFatalError(
    'Puolink could not start.',
    'No element with id="root" was found in index.html. Check that ' +
      'client/index.html still contains <div id="root">...</div>.'
  );
}
