import { Game } from './core/Game.js';

const container = document.getElementById('app');
const overlay = document.getElementById('overlay');
const resultEl = document.getElementById('result');
const resumeBtn = document.getElementById('resume-btn');
const modeButtons = document.querySelectorAll('.mode-btn');

const game = new Game(container);
game.start();

// Pick a mode on the home screen → start a fresh session and lock the pointer.
function startMode(mode) {
  resultEl.textContent = '';
  resultEl.className = 'result';
  game.startSession(mode);
  game.input.requestLock();
}

modeButtons.forEach((btn) =>
  btn.addEventListener('click', () => startMode(btn.dataset.mode))
);

// Resume from a pause (no reset).
resumeBtn.addEventListener('click', () => game.input.requestLock());
container.addEventListener('click', () => {
  if (!game.input.locked && game.started && game.player.alive) {
    game.input.requestLock();
  }
});

// Win / lose: show the result on the home screen.
game.onGameEnd = (result) => {
  resultEl.textContent = result.type === 'win' ? 'VICTORY — ALL WAVES CLEARED' : 'GAME OVER';
  resultEl.className = `result ${result.type}`;
};

// Pointer-lock drives the overlay: locked = playing, unlocked = home/pause.
game.input.onLockChange = (locked) => {
  if (locked) {
    overlay.classList.add('hidden');
    game.resume();
  } else {
    overlay.classList.remove('hidden');
    // Mid-session with the player alive = a pause; offer Resume.
    const paused = game.started && game.player.alive;
    resumeBtn.classList.toggle('hidden', !paused);
    if (paused) {
      resultEl.textContent = 'PAUSED';
      resultEl.className = 'result';
    }
  }
};
