/**
 * Last script of the page: starts the shell once every page file has registered itself.
 * If the shell could not be loaded at all, a plain message replaces the empty page.
 */
(function (root) {
  'use strict';

  const EDO = root.EDO;
  if (EDO && EDO.app && typeof EDO.app.start === 'function') {
    EDO.app.start();
    return;
  }
  const main = root.document.getElementById('app');
  if (main) {
    const message = root.document.createElement('p');
    message.className = 'stub-note';
    message.textContent = 'No se pudo iniciar la aplicación. Recargue la página y verifique que todos los archivos estén presentes.';
    main.replaceChildren(message);
  }
}(typeof window !== 'undefined' ? window : this));
