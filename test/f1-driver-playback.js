/* Play the inspected steering clip; individual pose buttons stop playback. */
(() => {
  function ready() {
    if (!document.body.dataset.check) return false;
    if (document.body.dataset.check !== 'pass') return true;
    const poses = document.querySelector('#poses'), button = document.createElement('button');
    let pending = 0, started = 0;
    function stop() {
      cancelAnimationFrame(pending); pending = 0; button.textContent = 'Play steering loop';
    }
    function tick(now) {
      window.driverPose(1 + ((now - started) * .024) % 288);
      pending = requestAnimationFrame(tick);
    }
    button.textContent = 'Play steering loop';
    button.onclick = () => {
      if (pending) { stop(); return; }
      started = performance.now(); button.textContent = 'Pause steering loop'; pending = requestAnimationFrame(tick);
    };
    poses.addEventListener('click', event => { if (event.target !== button && event.target.tagName === 'BUTTON') stop(); }, true);
    poses.append(button);
    return true;
  }
  if (!ready()) {
    const observer = new MutationObserver(() => { if (ready()) observer.disconnect(); });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-check'] });
  }
})();
