if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
      await navigator.serviceWorker.register("/uv/sw.js").catch(err => console.error("SW Registration failed:", err));
  });
}

let connection = null;
try {
  connection = new BareMux.BareMuxConnection("/baremux/worker.js");
} catch (err) {
  console.warn("BareMux not available:", err);
}

const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
const DEFAULT_FAVICON = "https://raw.githubusercontent.com/xxuep/xxuep-icons/main/eliteicon.png";



/* =====================================================================
   THEME CURSORS: a theme can opt in with ONE line in elite.css, e.g.
     [data-theme="city"] { --cursor-gif: url('https://.../cursor.gif'); }
   optional: --cursor-size: 32px;   --cursor-hotspot: 0 0;  (px from the image's top-left to the click point)
   If the active theme has no --cursor-gif line (or the image fails to load),
   nothing happens and the normal device cursor is used.
   A real <img> follows the mouse, because CSS cursors can't animate GIFs.
   ===================================================================== */
const eliteCursor = (() => {
  const img = document.createElement('img');
  img.id = 'eliteCursor'; img.alt = ''; img.setAttribute('aria-hidden', 'true'); img.draggable = false;
  document.body.appendChild(img);
  const root = document.documentElement;
  const canHover = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : { matches: true };
  let enabled = false, x = -9999, y = -9999, hx = 0, hy = 0, frame = 0, inside = false;

  function paint() {
    frame = 0;
    img.style.transform = `translate3d(${x - hx}px, ${y - hy}px, 0)`;
  }
  function show(on) { img.classList.toggle('visible', enabled && on); }
  function overViewer(t) { return !!(t && t.closest && t.closest('#viewer')); }   // proxied pages keep the real cursor
  function onMove(e) {
    x = e.clientX; y = e.clientY;
    inside = !overViewer(e.target);
    show(inside);
    if (!frame) frame = requestAnimationFrame(paint);
  }
  const onLeave = () => show(false);

  function disable() {
    if (!enabled && !root.classList.contains('elite-cursor-on')) return;
    enabled = false;
    root.classList.remove('elite-cursor-on');
    img.classList.remove('visible');
    img.removeAttribute('src');
    window.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseleave', onLeave);
  }
  function enable(url, size, hotspot) {
    img.style.width = size; img.style.height = 'auto';
    const h = hotspot.split(/\s+/).map(parseFloat);
    hx = h[0] || 0; hy = h[1] || 0;
    img.onload = () => {
      enabled = true;
      root.classList.add('elite-cursor-on');
      window.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseleave', onLeave);
    };
    img.onerror = disable;                       // broken link -> back to the normal cursor
    img.src = url;
  }
  function apply() {
    disable();
    if (!canHover.matches) return;               // touch screens have no cursor to replace
    const cs = getComputedStyle(document.body);
    const raw = cs.getPropertyValue('--cursor-gif').trim();
    const m = raw.match(/url\(\s*(['"]?)(.*?)\1\s*\)/);
    if (!m || !m[2]) return;                     // theme has no cursor line -> do nothing
    enable(m[2], cs.getPropertyValue('--cursor-size').trim() || '32px', cs.getPropertyValue('--cursor-hotspot').trim() || '0 0');
  }
  return { apply };
})();

/* =====================================================================
   THEME MUSIC: a theme can opt in with ONE line in elite.css, e.g.
     [data-theme="miku"] { --music: url('https://.../song.mp3'); }
   optional: --music-volume: 0.5;   (0 to 1)
   The round music button at the bottom of the sidebar turns the music on/off.
   If the active theme has no --music line (or the file fails to load) the
   button is grayed out and nothing can be played. The on/off choice is
   remembered, so it resumes when you switch back to a theme with music.
   ===================================================================== */
const eliteMusic = (() => {
  const KEY = 'elite_music_on';
  // The icon is a normal <img>. To use your own picture, paste its link here (or add --music-icon: url('...') to a theme).
  // Left empty, it uses the built-in music-note image below.
  const MUSIC_ICON_URL = 'https://raw.githubusercontent.com/xxuep/xxuep-icons/main/musiciconn.png';
  const DEFAULT_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>');
  const NOTE = '<img class="music-icon" alt="" width="30" height="30" draggable="false" src="' + (MUSIC_ICON_URL || DEFAULT_ICON) + '" />';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'musicBtn'; btn.className = 'sidebar-btn music-btn'; btn.innerHTML = NOTE + '<span class="music-slash" aria-hidden="true"></span>';
  (document.getElementById('sidebar') || document.body).appendChild(btn);   // bottom of the sidebar
  const audio = new Audio();
  audio.loop = true; audio.preload = 'metadata';   // metadata: a broken link is detected right away
  let available = false, wantOn = false, src = '', failed = false;
  try { wantOn = localStorage.getItem(KEY) === '1'; } catch {}

  function paint() {
    const playing = available && wantOn;
    btn.classList.toggle('is-disabled', !available);
    btn.classList.toggle('is-on', playing);
    btn.setAttribute('aria-disabled', String(!available));
    btn.setAttribute('aria-pressed', String(playing));
    btn.title = failed ? 'Music file failed to load' : !available ? 'No music for this theme' : playing ? 'Turn music off' : 'Turn music on';
    btn.setAttribute('aria-label', btn.title);
  }
  // browsers block sound until the page has been clicked/typed in once; wait for that, then start
  let waiting = false;
  function startWhenAllowed() {
    if (waiting) return;
    waiting = true;
    const go = () => {
      waiting = false;
      window.removeEventListener('pointerdown', go, true);
      window.removeEventListener('keydown', go, true);
      if (available && wantOn) audio.play().catch(() => {});
    };
    window.addEventListener('pointerdown', go, true);
    window.addEventListener('keydown', go, true);
  }
  function sync() {
    if (available && wantOn) {
      const p = audio.play();
      if (p && p.catch) p.catch(() => startWhenAllowed());
    } else audio.pause();
    paint();
  }
  function disable() {
    available = false; src = ''; failed = false;
    audio.pause(); audio.removeAttribute('src'); audio.load();
    paint();
  }
  function fail() {                               // link is wrong / file missing: gray out, but say why
    console.warn('[elite] theme music failed to load:', src);
    audio.pause();
    available = false; failed = true;
    paint();
  }
  function apply() {
    const cs = getComputedStyle(document.body);
    const raw = cs.getPropertyValue('--music').trim();
    const ic = cs.getPropertyValue('--music-icon').trim().match(/url\(\s*(['"]?)(.*?)\1\s*\)/);
    const wanted = (ic && ic[2]) || MUSIC_ICON_URL || DEFAULT_ICON;
    const iconEl = btn.querySelector('.music-icon');
    if (iconEl && iconEl.getAttribute('src') !== wanted) iconEl.setAttribute('src', wanted);
    const m = raw.match(/url\(\s*(['"]?)(.*?)\1\s*\)/);
    if (!m || !m[2]) { disable(); return; }       // theme has no music line -> grayed out
    const vol = parseFloat(cs.getPropertyValue('--music-volume'));
    audio.volume = isNaN(vol) ? 0.6 : Math.min(1, Math.max(0, vol));
    if (m[2] !== src) {                           // same song after a theme switch keeps playing
      src = m[2]; failed = false;
      audio.src = src;
    }
    available = !failed;
    sync();
  }
  audio.addEventListener('error', () => { if (src) fail(); });        // broken link -> grayed out
  btn.addEventListener('click', () => {
    if (!available) return;                       // grayed out: nothing to play
    wantOn = !wantOn;
    try { localStorage.setItem(KEY, wantOn ? '1' : '0'); } catch {}
    sync();
  });
  paint();
  return { apply };
})();

// Apply saved theme
const savedTheme = localStorage.getItem('elite_theme') || 'custom';
document.body.setAttribute('data-theme', savedTheme);
eliteCursor.apply();
eliteMusic.apply();

// Selectors
const themeSelect = document.getElementById('themeSelect');
const customColorPicker = document.getElementById('customColorPicker');

if (themeSelect) {
  themeSelect.value = savedTheme;
  
  if (savedTheme === 'custom') customColorPicker.style.display = 'block';
  const savedColor = localStorage.getItem('elite_custom_color') || '#005a9e';
  document.documentElement.style.setProperty('--custom-main', savedColor);
  customColorPicker.value = savedColor;
  
  themeSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    document.body.setAttribute('data-theme', val);
    localStorage.setItem('elite_theme', val);
    eliteCursor.apply();
eliteMusic.apply();
    
    if (val === 'custom') customColorPicker.style.display = 'block';
    else customColorPicker.style.display = 'none';
  });

  customColorPicker.addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--custom-main', e.target.value);
    localStorage.setItem('elite_custom_color', e.target.value);
  });
}

// --- EASY SETUP FOR IMAGE GRIDS ---
const grid1Data = [
  { title: "-3", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/minus33.jpg", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/-3__minus_3_.html" },
  { title: "-b", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/minusbb.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/-b__minus_b_.html" },
  { title: "10 Minutes till Dawn", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/10-minutes-till-dawn_1x1.jpeg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/10-minutes-till-dawn.html" },
  { title: "12 Mini Battles", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/12minibattles.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/12-mini-battles.html" },
  { title: "1 Date Danger", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/onedatedangerr.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/1_Date_Danger.html" },
  { title: "1 On 1 Soccer", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/1-on-1-soccer.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/1-on-1-soccer.html" },
  { title: "1 On 1 Tennis", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/1on1tennis.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/1-on-1-tennis.html" },
  { title: "1v1.lol", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/1v1 loo.jpeg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/1v1.lol.html" },
  { title: "2048", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/2048logo.jpeg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/2048.html" },
  { title: "2048 Cupcakes", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/2048logocupcakes.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/2048-cupcakes.html" },
  { title: "2048 Merge Run", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/2048cubemergee.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/2048_Merge_Run.html" },
  { title: "20 Minutes Till Dawn", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/20minstilldawnn.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/20_Minutes_Till_Dawn.html" },
  { title: "3D Bolt Master", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/3dboltmasterr.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/3D_Bolt_Master.html" },
  { title: "3D Bowling", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/3dbowlingg.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/3D_Bowling.html" },
  { title: "3D Flight Simulator", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/3dflight.jpeg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/3D-flight-simulator.html" },
  { title: "60 Seconds Reatomized", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/60secondss.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/60_Seconds__Reatomized.html" },
  { title: "64 in 1 NES", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/64in11.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/64_in_1_NES.html" },
  { title: "8ball Classic", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/8ballclassiclogo.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/8-ball-classic.html" },
  { title: "8 Ball Pool", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/8ballpooll.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/8_Ball_Pool.html" },
  { title: "9007199254740992", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/90071gamee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/9007199254740992.html" },
  { title: "99 Balls", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/99ballss.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/99_Balls.html" },
  { title: "A Bite at Freddys", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/abiteatfreddyss.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/A_Bite_at_Freddy_s.html" },
  { title: "A Dance of Fire and Ice", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/adancee.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/A_Dance_of_Fire_and_Ice.html" },
  { title: "A Difficult Game About Climbing", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/adifficultt.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/A_Difficult_Game_About_Climbing.html" },
  { title: "A Game About Feeding A Black Hole", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/blackholee.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/A_Game_About_Feeding_A_Black_Hole.html" },
  { title: "A Small World Cup", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/asmallworldcupp.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/A_Small_World_Cup.html" },
  { title: "Abandoned", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/abandonedd.png", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/Abandoned.html" },
  { title: "Ace Attorney Investigations - Miles Edgeworth", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/aceattorneyy.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/Ace_Attorney_Investigations_-_Miles_Edgeworth.html" },
  { title: "Age of War", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ageofwar.jpeg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/age-of-war.html" },
  { title: "Age of War 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ageofwar2.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/age-of-war-2.html" },
  { title: "Ages of Conflict", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/agesofclonflictlogo.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/ages-of-conflict.html" },
  { title: "Among Us", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/amongus.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/among-us.html" },
  { title: "Angry Birds", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/angry%20birds.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/angry-birds.html" },
  { title: "Angry Birds Showdown", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/angrybirdsshowdown.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/angry-birds-showdown.html" },
  { title: "Angry Birds Space", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/angrybirdsspace.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/angry-birds-space.html" },
  { title: "Angry Neighbor", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/angryneighborr.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep/angryneighborsinglefile/main/angryneighborsingle.html" },
  { title: "Awesome Tanks", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/awesome-tanks-game-icon.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/awesome-tanks.html" },
  { title: "Awesome Tanks 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/awesome-tanks-2-icon.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/awesome-tanks-2.html" },
  { title: "Axiom Verge", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/axiomvergee.png", htmlUrl: "https://raw.githubusercontent.com/xxuep/axiom-verge-single-file/main/axiomvergesingle.html" },
  { title: "Backrooms", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/backroomsgame.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/backrooms.html" },
  { title: "Bacon May Die", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/baconmaydieeee.jpeg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bacon-may-die.html" },
  { title: "Bad Ice Cream", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/badicecream1.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bad-ice-cream.html" },
  { title: "Bad Ice Cream 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/badicecream2.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bad-ice-cream-2.html" },
  { title: "Bad Ice Cream 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/badicecream3.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bad-ice-cream-3.html" },
  { title: "Bad Parenting", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/badparentingg.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bad-parenting.html" },
  { title: "Bad Piggies", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/badpiggiess.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bad-piggies.html" },
  { title: "Baldi's Basics", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/baldisbasicss.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/baldisbasics.html" },
  { title: "Baseball Bros", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/baseballbross.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/baseball-bros.html" },
  { title: "Basketball Legends", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/basketball-legends-2020.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/basketball-legends.html" },
  { title: "Basketball Stars", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/basketballstarss.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/basketball-stars.html" },
  { title: "Basket Bros", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/basketbross.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/basket-bros.html" },
  { title: "Basket Random", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/basketrandomm.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/basket-random.html" },
  { title: "Bitlife", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bitlifee.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bitlife.html" },
  { title: "Bit Planes", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bitplaness.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bit-planes.htm" },
  { title: "Blocky Snakes", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/blockysnakess.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/blocky-snakes.html" },
  { title: "Bloons TD", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bloonstd1.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bloons-TD.html" },
  { title: "Bloons TD 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bloonstd2.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bloons-TD-2.html" },
  { title: "Bloons TD 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bloonstd3.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bloons-TD-3.html" },
  { title: "Bloons TD 4", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bloonstd4.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bloons-TD-4.html" },
  { title: "Bloons TD 5", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bloondtd5.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bloons-TD-5.html" },
  { title: "Bloxorz", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bloxorzz.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bloxorz.html" },
  { title: "Blumgi Racers", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/blumgiracerss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/blumgi-racers.html" },
  { title: "Blumgi Rocket", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/blumgirockett.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/blumgi-rocket.html" },
  { title: "Bob the Robber", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bobtherobber1.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bob-the-robber.html" },
  { title: "Bob the Robber 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bobtherobber2.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bob-the-robber-2.html" },
  { title: "Bob the Robber 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bobtherobber3.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bob-the-robber-3.html" },
  { title: "Bouncy Motors", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bouncymotorss.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bouncy-motors.html" },
  { title: "Bow Masters", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bowmasterssss.jpeg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bow-masters.html" },
  { title: "Boxing Random", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/boxingrandomm.jpeg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/boxing-random.htm" },
  { title: "Breaking the Bank", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/breakingthebankk.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/breaking-the-bank.html" },
  { title: "Bubble Shooter", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/bubbleshooterr.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/bubble-shooter.html" },
  { title: "Buckshot Roulette", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/buckshott.jpg", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/buckshot.html" },
  { title: "Candy Crush", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/candycrushh.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/candy-crush.html" },
  { title: "Capybara Clicker", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/capybaraclickerr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/capybara-clicker.html" },
  { title: "Car Drawing", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/cardrawingg.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/car-drawing.html" },
  { title: "Car King Arena", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/carkingarenaa.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/car-king-arena.html" },
  { title: "Chess", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/chesss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/chess.html" },
  { title: "Choppy Orc", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/choppyorcc.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/choppy-orc.html" },
  { title: "Circlo O", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/circleoo.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/circloO.html" },
  { title: "Circlo O 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/circleoo2.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/circloO-2.html" },
  { title: "Clash of Vikings", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/clashofvikingss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/clash-of-vikings.html" },
  { title: "Cleanup.io", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/cleanupioo.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/cleanup-io.html" },
  { title: "Cluster Rush", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/clusterrushh.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/cluster-rush.html" },
  { title: "Cookie Clicker", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/cookieclickerr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/cookie-clicker.htm" },
  { title: "Crazy Cars", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/crazycarss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/crazy-cars.html" },
  { title: "Crazy Cattle 3d", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/crazycattle3dd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/crazy-cattle-3D.html" },
  { title: "Crazy Crash Landing", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/crazycrashlandingg.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/crazy-crash-landing.html" },
  { title: "Crazy Motorcycle", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/crazymotorcyclee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/crazy-motercycle.html" },
  { title: "Crossy Road", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/crossyroadd.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/crossy-road.htm" },
  { title: "Cut the Rope", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/cuttheropee.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/cut-the-rope.html" },
  { title: "Dadish", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/dadishh.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/dadish.html" },
  { title: "Dadish 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/dadishh2.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/dadish-2.html" },
  { title: "Dadish 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/dadishh3.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/dadish-3.html" },
  { title: "Deadly Descent", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/deadlydescentt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/deadly-descent.html" },
  { title: "Death Chase", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/deathchasee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/death-chase.html" },
  { title: "Death Run 3D", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/deathrun3dd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/death-run-3D.html" },
  { title: "Deltarune", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/deltarunee.jpg", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/deltarune.html" },
  { title: "Demolition Derby Crash Racing", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/demolitionderbyy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/demolition-derby-crash-racing.html" },
  { title: "Doki Doki Literature Club", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/dokidokii.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/Doki_Doki_Literature_Club.html" },
  { title: "Doodle Jump", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/doodlejumpp.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/doodle-jump.html" },
  { title: "Draw Climber", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/drawclimberr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/draw-climber.html" },
  { title: "Dreadhead Parkour", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/dreadheadparkourr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/dreadhead-parkour.htm" },
  { title: "Drift Boss", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/driftbosss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/drift-boss.htm" },
  { title: "Drift Hunters Pro", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/drifthuntersproo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/drift-hunters-pro.html" },
  { title: "Drive Mad", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/drivemadd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/drive-mad.htm" },
  { title: "Duck Life", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ducklifee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/duck-life.html" },
  { title: "Duck Life 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ducklife22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/duck-life-2.html" },
  { title: "Duck Life 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ducklife33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/duck-life-3.html" },
  { title: "Duck Life 4", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ducklife44.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/duck-life-4.html" },
  { title: "Duck Life 5", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ducklife55.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/duck-life-5.html" },
  { title: "Ducklings.io", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ducklingsioo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/ducklings-io.html" },
  { title: "Eagle Ride", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/eagleridee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/eagle-ride.html" },
  { title: "EagleCraft 1.12", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraft1.12.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/1.12.html" },
  { title: "EagleCraft 1.16", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraft1.16.jpg", htmlUrl: "https://raw.githubusercontent.com/MilkdromedaStudios/all-of-eaglercraft/main/Eaglercraft%201.16%20u3.html" },
  { title: "EagleCraft 1.17", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraft1.17.jpg", htmlUrl: "https://raw.githubusercontent.com/MilkdromedaStudios/all-of-eaglercraft/main/Eaglercraft%201.17.html" },
  { title: "EagleCraft 1.4.7", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraft1.4.7.jpg", htmlUrl: "https://raw.githubusercontent.com/MilkdromedaStudios/all-of-eaglercraft/blob/main/Eaglercraft%201.4.7.html" },
  { title: "EagleCraft 1.5.2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraft1.5.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/1.5.html" },
  { title: "EagleCraft 1.8.8", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraft1.8.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/1.8.html" },
  { title: "EagleCraft 26.2 Modded", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraft26.2modded.jpg", htmlUrl: "https://raw.githubusercontent.com/MilkdromedaStudios/all-of-eaglercraft/main/Eaglercraft%2026.2%20Modded.html" },
  { title: "EagleCraft 26.2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraft26.2.jpg", htmlUrl: "https://raw.githubusercontent.com/MilkdromedaStudios/all-of-eaglercraft/main/Eaglercraft%2026.2%20u2.html" },
  { title: "EagleCraft 26.3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraft26.3.jpg", htmlUrl: "https://raw.githubusercontent.com/MilkdromedaStudios/all-of-eaglercraft/main/Eaglercraft%2026.3.html" },
  { title: "EagleCraft Alpha 1.2.6", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraftalpha.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/Alpha_1.2.6.html" },
  { title: "EagleCraft Beta 1.3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraftbeta.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/Beta_1.3.html" },
  { title: "EagleCraft Indev", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraftindev.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/Indev.html" },
  { title: "EagleCraft Best Hacked", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minecraftbesthacked.jpg", htmlUrl: "https://raw.githubusercontent.com/MilkdromedaStudios/all-of-eaglercraft/main/Best%20Hacked%20Minecraft%20No%20AI.html" },
  { title: "EagleCraft Winston Horror", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/winstonhorrorr.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/winstonhorror.html" },
  { title: "EagleCraft GX-Client", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/gxclientt.png", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/gxclient.html" },
  { title: "Earn to Die", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/earntodiee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/earn-to-die.html" },
  { title: "Earn to Die 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/earntodie22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/earn-to-die-2.html" },
  { title: "Eggy Car", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/eggycarr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/eggy-car.html" },
  { title: "Elastic Face", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/elasticskinn.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/elastic-face.htm" },
  { title: "Escape Road", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/escaperoadd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/escaperoad.html" },
  { title: "Escape Road 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/escaperoad22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/escaperoad-2.html" },
  { title: "Escape Road 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/escaperoad33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/escaperoad-3.html" },
  { title: "Escaping the Prison", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/escapingtheprisonn.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/escaping-the-prison.html" },
  { title: "Eugenes Life", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/eugeneslifee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/eugenes-life.html" },
  { title: "Evil Glitch", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/evilglitchh.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/evil-glitch.html" },
  { title: "The Fancy Pants Adventures", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fancypantss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fancy-pants-adventure.html" },
  { title: "The Fancy Pants Adventures 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fancypants22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fancy-pants-adventure-2.html" },
  { title: "Fire Blob", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fireblobb.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fireblob.html" },
  { title: "Fire Boy and Water Girl", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/firewaterr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fireboy-and-watergirl.html" },
  { title: "Fire Boy and Water Girl 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/firewater22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fireboy-and-watergirl-2.html" },
  { title: "Fire Boy and Water Girl 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/firewater33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fireboy-and-watergirl-3.html" },
  { title: "Fire Boy and Water Girl 4", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/firewater44.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fireboy-and-watergirl-4.html" },
  { title: "Flappy Bird", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/flappybirdd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/flappy-bird.html" },
  { title: "Fleeing The Complex", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fleeingthecomplexx.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fleeing-the-complex.html" },
  { title: "Flood Runner 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/floodrunner22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/flood-runner-2.html" },
  { title: "Flood Runner 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/floodrunner33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/flood-runner-3.html" },
  { title: "Flood Runner 4", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/floodrunner44.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/flood-runner-4.html" },
  { title: "Five Nights at Freddys", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fnaf11.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fnaf.html" },
  { title: "Five Nights at Freddys 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fnaf22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fnaf-2.html" },
  { title: "Five Nights at Freddys 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fnaf33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fnaf-3.html" },
  { title: "Five Nights at Freddys 4", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fnaf44.jpg", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fnaf-4.html" },
  { title: "Five Nights at Freddys SL", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fnafsll.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fnaf-sister-location.html" },
  { title: "Football Bros", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/footballbross.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/football-bros.html" },
  { title: "Football Legends", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/footballlegendss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/football-legends.html" },
  { title: "Free Rider 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/freerider33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/free-rider-3.html" },
  { title: "Friday Night Funkin", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fridaynightfunkinn.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/friday-night-funkin.html" },
  { title: "Fruit Ninja", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/fruitninjaa.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/fruit-ninja.html" },
  { title: "Funny Battle", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/funnybattlee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/funny-battle.html" },
  { title: "Funny Battle 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/funnybattle22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/funny-battle-2.html" },
  { title: "Funny Mad Racing", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/funnymadracingg.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/funny-mad-racing.html" },
  { title: "Funny Shooter 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/funnyshooter22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/funny-shooter-2.html" },
  { title: "Gang Beasts", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/gangbeastss.jpg", htmlUrl: "https://raw.githubusercontent.com/xxuep/webport-list-for-wasm.rip-but-sf/main/gangbeasts/gangbeastssf.html" },
  { title: "Geometry Dash WASM FIXED", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/geometrydashwasmm.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/geometrydashreal.html" },
  { title: "Geometry Vibes", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/geometrydashvibess.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/geometry-vibes.html" },
  { title: "Get On Top", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/getontopp.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/get-on-top.html" },
  { title: "Getaway Shootout", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/getawayshootoutt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/getaway-shootout.htm" },
  { title: "Gladihoppers", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/gladihopperss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/gladi-hoppers.html" },
  { title: "Google Baseball", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/googlebaseballl.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/google-baseball.html" },
  { title: "Google Dino", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/googledinoo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/google-dino.html" },
  { title: "Gorilla Tag Winter Feb 2023", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/winterfeb20233.png", htmlUrl: "https://raw.githubusercontent.com/xxuep/webport-list-for-wasm.rip-but-sf/main/gtagwinterfeb2023/winterfeb2023sf.html" },
  { title: "Grand Theft Auto III", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/gtaiii.jpe", htmlUrl: "https://raw.githubusercontent.com/woahhcrackers/GTA3Web/main/index.html" },
  { title: "Granny", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/grannyy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/granny.html" },
  { title: "Granny 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/granny22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/granny-2.html" },
  { title: "Guess Their Answer", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/guesstheiranswerr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/guess-their-answer.html" },
  { title: "Guns Gore Cannoli", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/gunsgorecannolii.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/guns-gore-cannoli.html" },
  { title: "Hanger 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/hanger22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/hanger-2.html" },
  { title: "Happy Wheels", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/happywheelss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/happy-wheels.html" },
  { title: "Helix Jump", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/helixjumpp.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/helix-jump.html" },
  { title: "Hello Neighbor Alpha 1", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/hnalpha11.jpg", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/hnalpha1.html" },
  { title: "Highway Traffic", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/highwaytrafficc.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/highway-traffic.html" },
  { title: "Hill Climb Racing Lite", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/hillclimblitee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/hill-climb-racing-lite.html" },
  { title: "Hole.io", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/holeioo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/hole-io.html" },
  { title: "Hollow Knight", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/hollowknightt.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/hollow-knight.html" },
  { title: "House of Hazards", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/houseofhazardss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/house-of-hazards.html" },
  { title: "Hover Racer Drive", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/hoverracerdrivee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/hover-racer-drive.html" },
  { title: "Ice Dodo", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/icedodoo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/ice-dodo.html" },
  { title: "Idle Breakout", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/idlebreakoutt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/idlebreakout.html" },
  { title: "Idle Dice", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/idledicee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/idle-dice.html" },
  { title: "Infiltrating The Airship", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/infiltratingtheairshipp.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/infiltrating-the-airship.html" },
  { title: "Iron Snout", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ironsnoutt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/iron-snout.html" },
  { title: "Jacksmith", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/jacksmithh.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/jacksmith.html" },
  { title: "Jetpack Joyride", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/jetpackk.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/jetpack-joyride.html" },
  { title: "Johnny Trigger", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/johnnytriggerr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/johnny-trigger.html" },
  { title: "Jumping Shell", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/jumpingshelll.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/jumping-shell.html" },
  { title: "Karate Bros", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/karatebross.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/karate-bros.html" },
  { title: "Kart Bros", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/kartbross.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/kart-bros.html" },
  { title: "Keep Talking and Nobody Explodes", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ktanee.jpe", htmlUrl: "https://raw.githubusercontent.com/squidward5/ktane-webport/main/singlefile.html" },
  { title: "Kittytoy", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/kittytoyy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/kittytoy.html" },
  { title: "Learn To Fly", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/learntoflyy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/learn-to-fly.html" },
  { title: "Learn To Fly 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/learntofly22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/learn-to-fly-2.html" },
  { title: "Learn To Fly 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/learntofly33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/learn-to-fly-3.html" },
  { title: "Learn To Fly Idle", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/learntoflyidle.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/learn-to-fly-idle.html" },
  { title: "Level Devil", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/leveldevill.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/level-devil.html" },
  { title: "Little Alchemy 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/littlealchemy22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/littlealchemy-2.html" },
  { title: "Madalin Stunt Cars 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/madalinstuntcars22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/madalin-stunt-cars-2.html" },
  { title: "Madness Project Nexus", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/madnessprojectnexuss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/madness-project-nexus.html" },
  { title: "MeowDoku!", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/meowdokuu.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/meowdoku.html" },
  { title: "Melon Playground", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/melonplaygroundd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/melon-playground.html" },
  { title: "Merge Round Racers", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/mergeroundracerss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/merge-round-racers.html" },
  { title: "Minesweeper", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/minesweeperr.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/minesweeper.html" },
  { title: "Monkey Mart", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/monkeymartt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/monkey-mart.html" },
  { title: "Monster Tracks", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/monstertrackss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/monster-tracks.html" },
  { title: "Motherload", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/motherloadd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/motherload.html" },
  { title: "MotoX3m", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/motox3mm.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/moto-x3m.htm" },
  { title: "MotoX3m 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/motox3m22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/moto-x3m-2.html" },
  { title: "MotoX3m 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/motox3m33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/moto-x3m-3.html" },
  { title: "MotoX3m Pool Party", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/motox3mpoolpartyy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/moto-x3m-pool-party.html" },
  { title: "MotoX3m Spooky Land", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/motox3mspookylandd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/moto-x3m-spooky-land.html" },
  { title: "MotoX3m Winter", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/motox3mwinterr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/moto-x3m-winter.html" },
  { title: "Murder", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/murderr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/murder.html" },
  { title: "Noob Miner", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/noobminerr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/noob-miner.html" },
  { title: "Open TTD", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/openttdd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/openTTD.html" },
  { title: "Opposite Day", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/oppositedayy.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/opposite-day.html" },
  { title: "OVO", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ovoo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/ovo.html" },
  { title: "OVO 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ovo22.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/ovo-2.html" },
  { title: "OVO 3 Dimensions", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ovo33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/ovo-3-dimensions.html" },
  { title: "PacMan", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/pacmann.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/pac-man.html" },
  { title: "Papas Bakeria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papasbb.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-bakeria.html" },
  { title: "Papas Burgeria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papasbr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-burgeria.html" },
  { title: "Papas Cheeseria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papasch.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-cheeseria.html" },
  { title: "Papas Cupcakeria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papascc.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-cupcakeria.html" },
  { title: "Papas Donuteria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papasdn.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-donuteria.html" },
  { title: "Papas Freezeria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papasfz.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-freezeria.html" },
  { title: "Papas Hot Doggeria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papashd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-hot-doggeria.html" },
  { title: "Papas Pancakeria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papaspc.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-pancakeria.html" },
  { title: "Papas Pastaria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papaspt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-pastaria.html" },
  { title: "Papas Pizzeria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papaspz.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-pizzeria.html" },
  { title: "Papas Scooperia", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papassc.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-scooperia.html" },
  { title: "Papas Sushiria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papasss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-sushiria.html" },
  { title: "Papas Taco Mia", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papastm.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-taco-mia.html" },
  { title: "Papas Wingeria", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/papaswg.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/papas-wingeria.html" },
  { title: "Paper.io 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/paperio22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/paper-io-2.htm" },
  { title: "Parking Fury", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/parkingfuryy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/parking-fury.html" },
  { title: "Parking Fury 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/parkingfury22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/parking-fury-2.html" },
  { title: "Parking Fury 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/parkingfury33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/parking-fury-3.html" },
  { title: "PEAK", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/peakk.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep/webport-list-for-wasm.rip-but-sf/main/peak" },
  { title: "Picos School", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/picosschooll.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/picos-school.html" },
  { title: "Ping Pong Chaos", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/pingpongchaoss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/ping-pong-chaos.html" },
  { title: "Pixel Speedrun", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/pixelspeedrunn.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/pixel-speedrun.html" },
  { title: "Plants Vs Zombies", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/pvzz.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/plants-vs-zombies.html" },
  { title: "Plonky", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/plonkyy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/plonky.html" },
  { title: "Poly Track", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/polytrackk.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/polytrack.html" },
  { title: "Poor Bunny", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/poorbunnyy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/poor-bunny.html" },
  { title: "Pou", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/pouu.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/pou.html" },
  { title: "Ragdoll Archers", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ragdollarcherss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/ragdoll-archers.htm" },
  { title: "Ragdoll Hit", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ragdollhitt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/ragdoll-hit.html" },
  { title: "Ragdoll Soccer", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ragdollsoccerss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/ragdoll-soccer.html" },
  { title: "Red Ball 4 Vol.1", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/redballvol11.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/red-ball-4-vol-1.html" },
  { title: "Red Ball 4 Vol.2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/redballvol22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/red-ball-4-vol-2.html" },
  { title: "Red Ball 4 Vol.3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/redballvol33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/red-ball-4-vol-3.html" },
  { title: "Retro Bowl College", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/retrobowlcollegee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/retro-bowl-college.html" },
  { title: "Retro Bowl", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/retrobowll.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/retro-bowl.html" },
  { title: "Retro Highway", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/retrohighwayy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/retro-highway.html" },
  { title: "R.E.P.O", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/repoo.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/repo-halloween.html" },
  { title: "Riddle School", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/riddleschooll.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/riddle-school.html" },
  { title: "Riddle School 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/riddleschool22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/riddle-school-2.html" },
  { title: "Riddle School 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/riddleschool33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/riddle-school-3.html" },
  { title: "Riddle School 4", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/riddleschool44.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/riddle-school-4.html" },
  { title: "Riddle School 5", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/riddleschool55.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/riddle-school-5.html" },
  { title: "Riddle Transfer", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/riddletransferr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/riddle-transfer.html" },
  { title: "Riddle Transfer 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/riddletransfer22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/riddle-transfer-2.html" },
  { title: "Roblox 2007 (slow loading)", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/roblox2007.png", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/roblox2007.html" },
  { title: "Rocket Soccer Derby", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/rocketsoccerderbyy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/rocket-soccer-derby.html" },
  { title: "Rooftop Run", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/rooftoprunn.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/rooftop-run.html" },
  { title: "Rooftop Snipers", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/rooftopsniperss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/rooftop-snipers.htm" },
  { title: "Rooftop Snipers 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/rooftopsnipers22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/rooftop-snipers-2.html" },
  { title: "Run", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/runn.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/run.html" },
  { title: "Run 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/run22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/run-2.html" },
  { title: "Run 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/run33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/run-3.html" },
  { title: "Sand Game", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/sandgamee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/sand-game.html" },
  { title: "Sandbox City", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/sandboxcityy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/sandbox-city.html" },
  { title: "Short Life", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/shortlifee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/short-life.html" },
  { title: "Six Cats Under", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/sixcatsunderr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/six-cats-under.html" },
  { title: "Slope", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/slopee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/slope.html" },
  { title: "Slope 2 Player", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/slope22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/slope-2-player.html" },
  { title: "Slope 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/slope33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/slope-3.html" },
  { title: "Slow Roads", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/slowroadss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/slow-roads.html" },
  { title: "Super Mario 63", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/supermario633.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/sm-63.html" },
  { title: "Super Mario 64", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/supermario644.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/sm-64.html" },
  { title: "Snail Bob", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snailbobb.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snail-bob.html" },
  { title: "Snail Bob 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snailbob22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snail-bob-2.html" },
  { title: "Snail Bob 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snailbob33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snail-bob-3.html" },
  { title: "Snail Bob 4", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snailbob44.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snail-bob-4.html" },
  { title: "Snail Bob 5", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snailbob55.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snail-bob-5.html" },
  { title: "Snail Bob 6", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snailbob66.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snail-bob-6.html" },
  { title: "Snail Bob 7", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snailbob77.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snail-bob-7.html" },
  { title: "Snail Bob 8", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snailbob88.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snail-bob-8.html" },
  { title: "Snow Rider", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snowriderr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snow-rider.htm" },
  { title: "Snow Road", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snowroadd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snow-road.htm" },
  { title: "Snowball.io", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/snowballioo.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/snowball-io.html" },
  { title: "Soccer Bros", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/soccerbross.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/soccer-bros.html" },
  { title: "Soccer Random", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/soccerrandomm.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/soccer-random.htm" },
  { title: "Space Is Key", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/spaceiskeyy.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/space-is-key.html" },
  { title: "Space Is Key 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/spaceiskey22.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/space-is-key-2.html" },
  { title: "Space Waves", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/spacewavess.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/space-waves.html" },
  { title: "Spacebar Clicker", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/spacebarclickerr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/spacebar-clicker.html" },
  { title: "Speed Stars", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/speedstarss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/speed-stars.html" },
  { title: "Sprunki", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/sprunkii.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/sprunki.html" },
  { title: "Stack", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/stackk.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/stack.html" },
  { title: "Stacktris", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/stacktris.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/stacktris.html" },
  { title: "State.io", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/stateioo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/state-io.html" },
  { title: "Stealing the Diamond", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/stealingthediamondd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/stealing-the-diamond.html" },
  { title: "Stick Archers Battle", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/stickarchersbattlee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/stick-archers-battle.html" },
  { title: "Stick Fighter", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/stickfighterr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/stick-fighter.html" },
  { title: "Stick Merge", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/stickmergee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/stick-merge.html" },
  { title: "Stickman Hook", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/stickmanhookk.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/stickman-hook.html" },
  { title: "Subway Surfers Beijing", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ssbeijingg.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/subway-surfers-beijing.html" },
  { title: "Subway Surfers Havana", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/sshavanaa.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/subway-surfers-havana.html" },
  { title: "Subway Surfers San Francisco", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/sssanfranciscoo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/subway-surfers-san-francisco.html" },
  { title: "Super Bike the Champion", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/superbikethechampionn.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/super-bike-the-champion.html" },
  { title: "Super Liquid Soccer", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/superliquidsoccerr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/super-liquid-soccer.html" },
  { title: "Super Star Car", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/supercarstarr.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/super-star-car.html" },
  { title: "SuperHot", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/superhott.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/superhot.html" },
  { title: "Table Tennis World Tour", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ttwtt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/table-tennis-world-tour.html" },
  { title: "Tag", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/taggamee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/tag.html" },
  { title: "Tanuki Sunset", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/tanukisunsett.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/tanuki-sunset.html" },
  { title: "Tap Road", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/taproadd.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/tap-road.html" },
  { title: "Temple of Boom", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/templeofboomm.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/temple-of-boom.html" },
  { title: "Temple Run 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/templerun22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/temple-run-2.htm" },
  { title: "Territorial.io", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/territorialioo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/territorial-io.html" },
  { title: "Tetrominoes", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/tetrominn.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/tetrominoes.html" },
  { title: "The Impossible Quiz", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/impossiblequizz.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/the-impossible-quiz.html" },
  { title: "The Impossible Quiz 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/impossiblequiz22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/the-impossible-quiz-2.html" },
  { title: "There Is No Game", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/thereisnogamee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/there-is-no-g.html" },
  { title: "They Are Coming", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/theyarecomingg.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/they-are-coming.html" },
  { title: "This Is the Only Level", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/thisistheonlylevell.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/this-is-the-only-level.html" },
  { title: "This Is the Only Level Too", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/thisistheonlylevel22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/this-is-the-only-level-too.html" },
  { title: "Time Shooter 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/timeshooter22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/time-shooter-2.html" },
  { title: "Time Shooter 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/timeshooter33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/time-shooter-3.htm" },
  { title: "Tiny Fishing", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/tinyfishingg.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/tiny-fishing.html" },
  { title: "Tomb of the Mask", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/tombofthemaskk.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/tomb-of-the-mask.htm" },
  { title: "Trap the Cat", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/trapthecatt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/trap-the-cat.html" },
  { title: "Trees Hate You", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/treeshateyouu.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep/webport-list-for-wasm.rip-but-sf/main/treeshateyou/treeshateyousf.html" },
  { title: "Trivia Crack", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/triviacrackk.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/trivia-crack.html" },
  { title: "Tube Jumpers", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/tubejumperss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/tube-jumpers.html" },
  { title: "Tunnel Rush", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/tunnelrushh.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/tunnel-rush.html" },
  { title: "Turbo Dismount", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/turbodismount11.jpe", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/turbo-dismount.html" },
  { title: "Undertale", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/undertalee.jpg", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/undertale.html" },
  { title: "UltraKill", img: "https://raw.githubusercontent.com/xxuep1/offline-game-thumbnails/main/ultrakilll.png", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/ultrakill.html" },
  { title: "Unicycle Hero", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/unicycleheroo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/unicycle-hero.html" },
  { title: "Vex x3m", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/vexx3mm.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/vex-x3m.html" },
  { title: "Vex x3m 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/vexx3m22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/vex-x3m-2.html" },
  { title: "Vex 4", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/vex44.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/vex-4.html" },
  { title: "Vex 5", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/vex55.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/vex-5.html" },
  { title: "Vex 6", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/vex66.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/vex-6.html" },
  { title: "Vex 7", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/vex77.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/vex-7.htm" },
  { title: "Vex 8", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/vex88.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/vex-8.htm" },
  { title: "Volley Random", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/volleyrandomm.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/volley-random.html" },
  { title: "War the Knights", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wartheknightss.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/war-the-knights.html" },
  { title: "We Become What We Behold", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wbwwbb.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/we-become-what-we-behold.html" },
  { title: "Wheelie Bike", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wheeliebikee.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wheelie-bike.html" },
  { title: "Wheely", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wheelyy.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wheely.html" },
  { title: "Wheely 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wheely22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wheely-2.html" },
  { title: "Wheely 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wheely33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wheely-3.html" },
  { title: "Wheely 4", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wheely44.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wheely-4.html" },
  { title: "Wheely 5", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wheely55.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wheely-5.html" },
  { title: "Wheely 6", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wheely66.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wheel-6.html" },
  { title: "Wheely 7", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wheely77.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wheely-7.html" },
  { title: "Wheely 8", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wheely88.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wheely-8.html" },
  { title: "Wordle Unlimited", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wordleunlimitedd.png", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wordle-unlimited.html" },
  { title: "Worlds Hardest Game", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/whgg.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/worlds-hardest-game.html" },
  { title: "Worlds Hardest Game 2", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/whg22.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/worlds-hardest-game-2.html" },
  { title: "Worlds Hardest Game 3", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/whg33.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/worlds-hardest-game-3.html" },
  { title: "Wrestle Bros", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/wrestlebross.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/wrestle-bros.html" },
  { title: "Yohoho.io", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/yohohoioo.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/yohoho-io.html" },
  { title: "Zombie Rush", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/zombierushh.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/zombie-rush.html" },
  { title: "Zrist", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/zristt.jpe", htmlUrl: "https://raw.githubusercontent.com/CoolDude2349/Offline-Single-File-Games/master/offline/zrist.html" },
]





const movieGridData = [
  {
    title: "Backrooms (2026)",
    thumb: "https://raw.githubusercontent.com/xxuep/movie-thumbnails/main/backroomsmoviecool.jpe",
    embedUrl: "https://drive.google.com/file/d/1-K2eTaok437rd6bDzPotVfWKfS1o-kAw/preview"
  },
];

// ======= elements =======
const tabsBar = document.getElementById('tabsBar');
const tabsNewBtn = document.getElementById('tabsNewBtn');
const chromeBar = document.getElementById('chromeBar');
const address = document.getElementById('address');
const addressForm = document.getElementById('addressForm');
const addressClear = document.getElementById('addressClear');
const reloadBtn = document.getElementById('reloadBtn');
const homeBtn = document.getElementById('homeBtn');
const browserLoadingText = document.getElementById('browserLoadingText');
let browserLoadingTimer = 0;
let browserLoadingStarted = 0;
let closedTabs = [];
const searchInput = document.getElementById('search');
const newtab = document.getElementById('newtab');
const iframe = document.getElementById('viewer');
const iframeLoadingBg = document.getElementById('iframe-loading-bg');
const newTabBtn = document.getElementById('newTabBtn');
const closeBtn = document.getElementById('closeBtn');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const searchEngineSelect = document.getElementById('searchEngineSelect');

// Sidebar & Page Elements
const pageContainers = {
  home: { btn: document.getElementById('nav-home'), el: document.getElementById('home-page') },
  browser: { btn: document.getElementById('nav-browser') }, 
  page2: { btn: document.getElementById('nav-page2'), el: document.getElementById('page2') },
  page3: { btn: document.getElementById('nav-page3'), el: document.getElementById('page3') },
  page4: { btn: document.getElementById('nav-page4'), el: document.getElementById('page4') },
  settings: { btn: document.getElementById('nav-settings'), el: document.getElementById('settings-page') },
  credits: { btn: document.getElementById('nav-credits'), el: document.getElementById('credits-page') }
};

// ======= tab model =======
let tabs = [];
let currentTabId = null;
let nextTabId = 1;

// ======= customizable shortcuts =======
const savedShortcuts = [
  { name: 'TikTok', url: 'https://tiktok.com' },
  { name: 'YouTube', url: 'https://youtube.com' },
  { name: 'Discord', url: 'https://discord.com' },
  { name: 'Instagram', url: 'https://instagram.com' },
  { name: 'Spotify', url: 'https://open.spotify.com' }
];

function updateTopOffsets() {
  if (!tabsBar || !chromeBar || !iframe) return;
  const tabsH = tabsBar.offsetHeight;
  const chromeH = chromeBar.offsetHeight;
  const warningEl = document.getElementById('compat-warning');
  const warningH = (warningEl && warningEl.style.display !== 'none') ? warningEl.offsetHeight : 0;
  const totalHeaderH = tabsH + chromeH + warningH;

  chromeBar.style.top = tabsH + 'px';
  if (warningEl) warningEl.style.top = (tabsH + chromeH) + 'px';
  
  iframe.style.top = totalHeaderH + 'px';
  iframe.style.height = (window.innerHeight - totalHeaderH) + 'px';
  
  if (iframeLoadingBg) {
    iframeLoadingBg.style.top = totalHeaderH + 'px';
    iframeLoadingBg.style.height = (window.innerHeight - totalHeaderH) + 'px';
  }
  if (newtab) {
    newtab.style.top = totalHeaderH + 'px';
    newtab.style.height = (window.innerHeight - totalHeaderH) + 'px';
  }
}

async function checkCompatibility() {
  const warningEl = document.getElementById('compat-warning');
  if (!warningEl) return;

  let isIncompatible = false;

  if (location.protocol === 'file:' || location.protocol === 'data:') isIncompatible = true;
  if (!('serviceWorker' in navigator)) isIncompatible = true;
  if (window.origin === 'null' || location.href === 'about:blank') isIncompatible = true;

  if (!isIncompatible) {
    try {
      const res = await fetch('/uv/sw.js', { method: 'HEAD' });
      if (!res.ok) isIncompatible = true;
    } catch (err) {
      isIncompatible = true;
    }
  }

  if (isIncompatible) {
    warningEl.style.display = 'block';
    updateTopOffsets();
  }
}

checkCompatibility();

function switchView(viewName) {
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page-container').forEach(p => p.style.display = 'none');
  const isBrowser = viewName === 'browser';
  document.body.classList.toggle('elite-browser-view', isBrowser);
  if (tabsBar) tabsBar.style.display = isBrowser ? 'flex' : 'none';
  if (chromeBar) chromeBar.style.display = isBrowser ? 'flex' : 'none';
  if (newtab) newtab.style.display = 'none';
  if (iframe) iframe.style.display = 'none';
  if (iframeLoadingBg) iframeLoadingBg.style.display = 'none';
  const page = pageContainers[viewName];
  if (page && page.btn) page.btn.classList.add('active');
  if (page && page.el) page.el.style.display = 'block';
  if (isBrowser && currentTabId != null) switchToTab(currentTabId);
  if (isBrowser) updateTopOffsets();
}

for (const name of ['home','browser','page2','page3','page4','settings','credits']) {
  const page = pageContainers[name];
  if (page && page.btn) page.btn.addEventListener('click', () => switchView(name));
}
document.getElementById('home-open-browser')?.addEventListener('click', () => switchView('browser'));

function getSearchEnginePrefix() {
  const engine = localStorage.getItem('xxuep_engine') || 'duckduckgo';
  const engines = {
    'google': 'https://www.google.com/search?q=',
    'duckduckgo': 'https://duckduckgo.com/?q=',
    'brave': 'https://search.brave.com/search?q=',
    'yahoo': 'https://search.yahoo.com/search?p=',
    'bing': 'https://www.bing.com/search?q='
  };
  return engines[engine] || engines['duckduckgo'];
}

function getSearchEngineName() {
  const engine = localStorage.getItem('xxuep_engine') || 'duckduckgo';
  const names = {
    'google': 'Google',
    'duckduckgo': 'DuckDuckGo',
    'brave': 'Brave',
    'yahoo': 'Yahoo',
    'bing': 'Bing'
  };
  return names[engine] || 'DuckDuckGo';
}

function normalizeUrl(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  if (/\s/.test(value)) return getSearchEnginePrefix() + encodeURIComponent(value);
  if (/^(https?:\/\/)/i.test(value)) return value;
  if (/^(localhost|127(?:\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(value)) return 'http://' + value;
  if (/^[a-z0-9-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(value)) return 'https://' + value;
  if (/^\[[0-9a-f:]+\](?::\d+)?(?:[/?#].*)?$/i.test(value)) return 'https://' + value;
  return getSearchEnginePrefix() + encodeURIComponent(value);
}

function getDomainFromInput(input) {
  try {
    let maybe = input.trim();
    if (!/^([a-zA-Z][a-zA-Z\d+\-.]*:)?\/\//.test(maybe)) {
      if (!maybe.includes('.')) return null; 
      maybe = 'https://' + maybe;
    }
    const u = new URL(maybe);
    return u.hostname;
  } catch (e) {
    return null;
  }
}

function faviconForInput(input) {
  const domain = getDomainFromInput(input);
  if (!domain) return DEFAULT_FAVICON;
  return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
}

function createTabElement(tab) {
  const el = document.createElement('div');
  el.className = 'tab';
  el.dataset.tabId = tab.id;
  el.setAttribute('role', 'tab');
  el.setAttribute('aria-selected', String(tab.id === currentTabId));
  el.title = tab.title || 'New tab';

  const fav = document.createElement('img');
  fav.className = 'favicon';
  fav.src = tab.favicon || DEFAULT_FAVICON;
  fav.alt = '';
  fav.loading = 'lazy';
  fav.onerror = () => { fav.src = DEFAULT_FAVICON; };

  const t = document.createElement('div');
  t.className = 'title';
  t.textContent = tab.title || 'new tab';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close ' + (tab.title || 'tab'));
  close.title = 'Close tab';

  el.append(fav, t, close);
  el.addEventListener('click', e => {
    if (e.target !== close) switchToTab(tab.id);
  });
  close.addEventListener('click', e => {
    e.stopPropagation();
    closeTab(tab.id);
  });
  return el;
}

function renderTabs() {
  if (!tabsBar) return;
  const fragment = document.createDocumentFragment();
  for (const tab of tabs) {
    const tabEl = createTabElement(tab);
    if (tab.id === currentTabId) tabEl.classList.add('active');
    fragment.appendChild(tabEl);
  }
  tabsBar.querySelectorAll('.tab').forEach(node => node.remove());
  tabsBar.insertBefore(fragment, tabsNewBtn);
  updateTopOffsets();
  updateBrowserControls();
}

function updateBrowserControls() {
  const tab = tabs.find(item => item.id === currentTabId);
  if (backBtn) backBtn.classList.toggle('is-disabled', !tab || tab.index <= 0);
  
  if (forwardBtn) forwardBtn.classList.toggle('is-disabled', !tab || tab.index >= tab.history.length - 1);
  if (reloadBtn) reloadBtn.title = tab && tab.iframeUrl ? 'Reload page (Ctrl+R)' : 'Reload';
}

function setBrowserLoading(active, message = 'Preparing secure connection…') {
  if (!iframeLoadingBg) return;
  window.clearTimeout(browserLoadingTimer);
  if (browserLoadingText) browserLoadingText.textContent = message;
  if (active) {
    browserLoadingStarted = performance.now();
    iframeLoadingBg.classList.add('visible');
    iframeLoadingBg.setAttribute('aria-hidden', 'false');
    browserLoadingTimer = window.setTimeout(() => setBrowserLoading(false), 25000);
  } else {
    const elapsed = performance.now() - browserLoadingStarted;
    const wait = Math.max(0, 260 - elapsed);
    browserLoadingTimer = window.setTimeout(() => {
      iframeLoadingBg.classList.remove('visible');
      iframeLoadingBg.setAttribute('aria-hidden', 'true');
    }, wait);
  }
}

function syncAddress(tab, addressValue = null) {
  if (!tab) return;
  const raw = addressValue || (tab.displayHistory && tab.index >= 0 ? tab.displayHistory[tab.index] : (tab.input || ''));
  if (address && document.activeElement !== address) address.value = raw;
  const isSecure = /^https:/i.test(raw) || /^https?:/i.test(raw);
  const lock = document.getElementById('addressLock');
  if (lock) {
    lock.textContent = isSecure ? '◆' : '⌑';
    lock.classList.toggle('secure', isSecure);
  }
}

function createTab(initialInput = '') {
  const id = nextTabId++;
  const tab = {
    id,
    title: initialInput || 'new tab',
    input: initialInput,
    iframeUrl: '',
    history: [],
    displayHistory: [],
    index: -1,
    favicon: faviconForInput(initialInput || ''),
    newtabValue: '',
    navigationId: 0
  };
  tabs.push(tab);
  currentTabId = id;
  renderTabs();
  switchToTab(id);
  window.setTimeout(() => {
    if (!tab.iframeUrl && searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }, 0);
  return tab;
}

async function navigateTab(tabId, input) {
  const tab = tabs.find(item => item.id === tabId);
  const value = String(input || '').trim();
  if (!tab || !value) return;
  const navigationId = ++tab.navigationId;
  tab.input = value;
  const normalizedUrl = normalizeUrl(value);
  const isSearch = normalizedUrl.startsWith(getSearchEnginePrefix());
  let displayTitle = value;
  if (isSearch) displayTitle = value + ' - ' + getSearchEngineName();
  else {
    try { displayTitle = new URL(normalizedUrl).hostname.replace(/^www\\./, ''); } catch {}
  }
  tab.title = displayTitle;
  tab.favicon = faviconForInput(normalizedUrl);
  tab.newtabValue = '';

  if (connection) {
    try {
      if (!await connection.getTransport()) {
        await connection.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);
      }
    } catch (err) {
      console.warn('[elite] transport setup:', err);
    }
  }
  if (!tabs.includes(tab) || tab.navigationId !== navigationId) return;

  if (typeof __uv$config === 'undefined') {
    console.error('[elite] Ultraviolet configuration is unavailable.');
    setBrowserLoading(false);
    return;
  }

  const final = __uv$config.prefix + __uv$config.encodeUrl(normalizedUrl);
  tab.history = tab.history.slice(0, tab.index + 1);
  tab.displayHistory = (tab.displayHistory || []).slice(0, tab.index + 1);
  tab.history.push(final);
  tab.displayHistory.push(normalizedUrl);
  tab.index = tab.history.length - 1;
  tab.iframeUrl = final;

  if (tab.id === currentTabId) {
    if (address) address.value = value;
    syncAddress(tab);
    if (iframe) {
      iframe.style.display = 'block';
      if (iframe.src !== new URL(final, location.href).href) {
        setBrowserLoading(true, 'Connecting to ' + (isSearch ? getSearchEngineName() : displayTitle) + '…');
        iframe.src = final;
      } else {
        setBrowserLoading(false);
      }
    }
    if (newtab) newtab.style.display = 'none';
  }
  renderTabs();
}

function switchToTab(tabId) {
  const tab = tabs.find(item => item.id === tabId);
  if (!tab) return;
  currentTabId = tabId;
  if (tab.iframeUrl) {
    if (iframe) {
      iframe.style.display = 'block';
      const target = tab.history[tab.index] || tab.iframeUrl;
      if (iframe.src !== new URL(target, location.href).href) {
        setBrowserLoading(true, 'Restoring ' + (tab.title || 'tab') + '…');
        iframe.src = target;
      }
    }
    if (newtab) newtab.style.display = 'none';
    syncAddress(tab);
  } else {
    if (iframe) {
      iframe.style.display = 'none';
      iframe.src = 'about:blank';
    }
    setBrowserLoading(false);
    if (newtab) newtab.style.display = 'flex';
    if (searchInput) searchInput.value = tab.newtabValue || '';
    if (address) address.value = '';
    const lock = document.getElementById('addressLock');
    if (lock) { lock.textContent = '⌑'; lock.classList.remove('secure'); }
  }
  renderTabs();
}

function closeTab(tabId) {
  const idx = tabs.findIndex(item => item.id === tabId);
  if (idx === -1) return;
  const wasCurrent = tabs[idx].id === currentTabId;
  const removed = tabs.splice(idx, 1)[0];
  closedTabs.push({ ...removed, history: [...removed.history] });
  if (closedTabs.length > 10) closedTabs.shift();
  if (!tabs.length) {
    createTab();
    return;
  }
  if (wasCurrent) switchToTab(tabs[Math.min(idx, tabs.length - 1)].id);
  else renderTabs();
}

function restoreClosedTab() {
  const previous = closedTabs.pop();
  if (!previous) return;
  const tab = { ...previous, id: nextTabId++, history: [...previous.history], displayHistory: [...(previous.displayHistory || [])], navigationId: 0 };
  tabs.push(tab);
  switchToTab(tab.id);
}

function goBack() {
  const tab = tabs.find(item => item.id === currentTabId);
  if (!tab || tab.index <= 0) return;
  tab.index--;
  if (iframe) {
    setBrowserLoading(true, 'Going back…');
    iframe.src = tab.history[tab.index];
  }
  syncAddress(tab);
  updateBrowserControls();
}

function goForward() {
  const tab = tabs.find(item => item.id === currentTabId);
  if (!tab || tab.index >= tab.history.length - 1) return;
  tab.index++;
  if (iframe) {
    setBrowserLoading(true, 'Going forward…');
    iframe.src = tab.history[tab.index];
  }
  syncAddress(tab);
  updateBrowserControls();
}

function reloadCurrentTab() {
  const tab = tabs.find(item => item.id === currentTabId);
  if (!tab || !tab.iframeUrl) {
    if (tab && searchInput) searchInput.focus();
    return;
  }
  setBrowserLoading(true, 'Reloading page…');
  if (iframe) iframe.src = tab.history[tab.index] || tab.iframeUrl;
}

function goHome() {
  const tab = tabs.find(item => item.id === currentTabId);
  if (!tab) return;
  tab.iframeUrl = '';
  tab.history = [];
  tab.displayHistory = [];
  tab.index = -1;
  tab.input = '';
  tab.title = 'new tab';
  tab.favicon = DEFAULT_FAVICON;
  tab.newtabValue = '';
  if (iframe) {
    iframe.src = 'about:blank';
    iframe.style.display = 'none';
  }
  setBrowserLoading(false);
  if (newtab) newtab.style.display = 'flex';
  if (searchInput) searchInput.value = '';
  if (address) address.value = '';
  renderTabs();
}

if (iframe) {
  iframe.addEventListener('load', () => {
    const active = tabs.find(item => item.id === currentTabId);
    if (active && active.iframeUrl) setBrowserLoading(false);
  });
  iframe.addEventListener('error', () => setBrowserLoading(false));
}

if (addressForm && address) {
  addressForm.addEventListener('submit', event => {
    event.preventDefault();
    const value = address.value.trim();
    if (!value) return;
    if (currentTabId == null) createTab();
    navigateTab(currentTabId, value);
    address.blur();
  });
}
addressClear?.addEventListener('click', () => {
  if (address) {
    address.value = '';
    address.focus();
  }
});
reloadBtn?.addEventListener('click', reloadCurrentTab);
homeBtn?.addEventListener('click', goHome);

if (tabsNewBtn) tabsNewBtn.addEventListener('click', () => createTab());
if (newTabBtn) newTabBtn.addEventListener('click', () => createTab());
if (closeBtn) closeBtn.addEventListener('click', () => { if (currentTabId != null) closeTab(currentTabId); });
if (backBtn) backBtn.addEventListener('click', goBack);
if (forwardBtn) forwardBtn.addEventListener('click', goForward);

if (searchInput) {
  searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const val = searchInput.value.trim();
      if (!val) return;
      if (currentTabId == null) { 
        const t = createTab(val); 
        navigateTab(t.id, val); 
      } else {
        navigateTab(currentTabId, val);
      }
    }
  });
}

document.addEventListener('keydown', event => {
  const browserActive = document.body.classList.contains('elite-browser-view');
  if (!browserActive) return;
  const key = event.key.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (mod && key === 'l') {
    event.preventDefault();
    address?.focus();
    address?.select();
  } else if (mod && event.shiftKey && key === 't') {
    event.preventDefault();
    restoreClosedTab();
  } else if (mod && key === 't') {
    event.preventDefault();
    createTab();
  } else if (mod && key === 'w') {
    event.preventDefault();
    if (currentTabId != null) closeTab(currentTabId);
  } else if (mod && key === 'r') {
    event.preventDefault();
    reloadCurrentTab();
  } else if (mod && key === 'tab') {
    event.preventDefault();
    if (tabs.length > 1) {
      const index = tabs.findIndex(tab => tab.id === currentTabId);
      const next = (index + (event.shiftKey ? tabs.length - 1 : 1)) % tabs.length;
      switchToTab(tabs[next].id);
    }
  } else if (mod && /^[1-8]$/.test(key)) {
    event.preventDefault();
    const tab = tabs[Number(key) - 1];
    if (tab) switchToTab(tab.id);
  } else if (mod && key === '9') {
    event.preventDefault();
    if (tabs.length) switchToTab(tabs[tabs.length - 1].id);
  } else if (event.altKey && key === 'arrowleft') {
    event.preventDefault();
    goBack();
  } else if (event.altKey && key === 'arrowright') {
    event.preventDefault();
    goForward();
  } else if (key === 'escape' && document.activeElement === address) {
    address.blur();
    syncAddress(tabs.find(tab => tab.id === currentTabId));
  }
});

if (searchEngineSelect) {
  searchEngineSelect.value = localStorage.getItem('xxuep_engine') || 'duckduckgo';
  searchEngineSelect.addEventListener('change', (e) => {
    localStorage.setItem('xxuep_engine', e.target.value);
  });
}

function renderShortcuts() {
  const container = document.getElementById('shortcuts');
  if (!container) return;
  container.innerHTML = '';
  savedShortcuts.forEach(sc => {
    const el = document.createElement('div');
    el.className = 'shortcut';
    
    const img = document.createElement('img');
    img.src = faviconForInput(sc.url);
    
    const span = document.createElement('span');
    span.textContent = sc.name;
    
    el.appendChild(img);
    el.appendChild(span);
    
    el.addEventListener('click', () => {
       if (currentTabId == null) {
         const t = createTab(sc.url);
         navigateTab(t.id, sc.url);
       } else {
         navigateTab(currentTabId, sc.url);
       }
    });
    container.appendChild(el);
  });
}

function openVideoPlayer(item) {
  const win = window.open("about:blank");
  if (!win) {
    alert("Please allow popups for video playback.");
    return;
  }
  const title = String(item.title || "Video")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const src = String(item.embedUrl || "");

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
#frame { position: fixed; inset: 0; width: 100vw; height: 100vh; border: none; display: block; background: #000; }
.overlay { position: fixed; inset: 0; pointer-events: none; }
.badge { position: absolute; left: 16px; bottom: 16px; padding: 8px 12px; border-radius: 999px; background: rgba(0,0,0,0.35); color: #a0a0a0; font: 12px Inter, sans-serif; border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(10px); }
</style>
</head>
<body>
<iframe id="frame" src="${src}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
<div class="overlay"><div class="badge">Elite</div></div>
</body>
</html>`);
  win.document.close();
}

function buildVideoGrid(containerId, dataArray) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  const lazy = createLazyGrid(container, item => {
    const el = document.createElement("div");
    el.className = "grid-item";
    const img = document.createElement("img");
    img.src = item.thumb; img.alt = item.title; img.loading = "lazy"; img.decoding = "async";
    const info = document.createElement("div");
    info.className = "info"; info.textContent = item.title;
    el.append(img, info);
    el.addEventListener("click", () => openVideoPlayer(item));
    return el;
  });
  lazy.setList(dataArray);
}

async function openCloakedTab(htmlUrl) {
    const win = window.open("about:blank");
    if (!win) {
        alert("Please allow popups for about:blank deployment to work.");
        return;
    }
    try {
        const response = await fetch(htmlUrl);
        const html = await response.text();
        win.document.open();
        win.document.write(html);
        win.document.close();
    } catch (err) {
        win.document.write("Failed to load: " + err);
    }
}

function buildGrid(containerId, dataArray) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  container._gridData = dataArray;
  const frag = document.createDocumentFragment();
  dataArray.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'grid-item';
    el.dataset.i = i;
    el.innerHTML = `
      <img src="${item.img}" alt="${item.title}" loading="lazy" decoding="async" />
      <span class="glare" aria-hidden="true"></span>
      <div class="info">${item.title}</div>
    `;
    frag.appendChild(el);
  });
  container.appendChild(frag);
  if (!container._gridClick) {
    container._gridClick = true;
    container.addEventListener('click', e => {
      const card = e.target.closest('.grid-item');
      if (!card || !container.contains(card)) return;
      const item = container._gridData[+card.dataset.i];
      if (item) openCloakedTab(item.htmlUrl);
    });
  }
}

/* =====================================================================
   LAZY GRIDS: only a small batch of cards is in the DOM at first; more are
   added as you scroll (IntersectionObserver). Used by games, apps and movies.
   ===================================================================== */
function createLazyGrid(container, makeCard, opts = {}) {
  const first = opts.first || 12;     // cards in the very first chunk (fast first paint)
  const batch = opts.batch || 18;     // cards per chunk while scrolling
  const slice = opts.slice || 6;      // cards built per animation frame (keeps frames short)
  const root = opts.root || container.closest('.page-container') || null;
  const sentinel = document.createElement('div');
  sentinel.className = 'grid-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  container.appendChild(sentinel);
  let list = [], shown = 0, target = 0, raf = 0;
  const io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) more(); }, { root, rootMargin: '400px 0px' })
    : null;
  function watch() {
    if (!io) return;
    io.unobserve(sentinel);                       // re-observing forces a fresh check
    if (shown >= target && shown < list.length) io.observe(sentinel);
  }
  // builds one small slice of the current chunk per frame, so a chunk never blocks the page
  function pump() {
    raf = 0;
    const end = Math.min(target, shown + slice);
    const frag = document.createDocumentFragment();
    for (; shown < end; shown++) {
      const el = makeCard(list[shown]);
      el.classList.add('card-in');
      frag.appendChild(el);
    }
    container.insertBefore(frag, sentinel);
    if (shown < target) raf = requestAnimationFrame(pump);
    else requestAnimationFrame(watch);
  }
  function more() {
    if (shown >= list.length || shown < target) return;   // nothing left, or a chunk is still building
    target = io ? Math.min(list.length, shown + (shown === 0 ? first : batch)) : list.length;
    pump();
  }
  return {
    setList(next) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      container.querySelectorAll(':scope > .grid-item').forEach(el => el.remove());
      list = next.slice(); shown = 0; target = 0;
      more(); watch();
    },
    add(item) { const all = shown === list.length; list.push(item); if (all) more(); else watch(); },
    remove(item) {
      const i = list.indexOf(item);
      if (i < 0) return;
      list.splice(i, 1);
      if (i < shown) { shown--; const el = container.children[i]; if (el && el !== sentinel) el.remove(); }
      target = Math.min(target, list.length);
    },
    size() { return list.length; }
  };
}

/* =====================================================================
   LIBRARY PAGE (games / apps): lazy "All" grid + "Favorites" grid, star
   buttons, search, randomize. Favorites persist in localStorage.
   ===================================================================== */
const ELITE_STAR_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2.6l2.95 6.1 6.65.9-4.85 4.65 1.2 6.6L12 17.6l-5.95 3.25 1.2-6.6L2.4 9.6l6.65-.9z"/></svg>';
function eliteLibrary(cfg) {
  const { data, noun, store, ids } = cfg;
  const $ = id => document.getElementById(id);
  const allBox = $(ids.all), favBox = $(ids.fav);
  if (!allBox || !favBox) return;
  const input = $(ids.search), clear = $(ids.clear), count = $(ids.count), none = $(ids.none);
  const favCount = $(ids.favCount), allCount = $(ids.allCount), favEmpty = $(ids.favEmpty), rand = $(ids.rand);

  const keyOf = it => it.htmlUrl || it.title;
  const byKey = new Map(data.map(it => [keyOf(it), it]));
  const index = new Map(data.map(it => { const n = it.title.toLocaleLowerCase(); return [it, { n, c: n.replace(/[^a-z0-9]/g, '') }]; }));

  let favs = [];
  try { favs = JSON.parse(localStorage.getItem(store) || '[]').filter(k => byKey.has(k)); } catch { favs = []; }
  const saveFavs = () => { try { localStorage.setItem(store, JSON.stringify(favs)); } catch {} };

  let order = data.slice(), query = '';
  const matches = it => {
    if (!query) return true;
    const ix = index.get(it);
    const tokens = query.split(/\s+/).filter(Boolean);
    const compact = query.replace(/[^a-z0-9]/g, '');
    return tokens.every(t => ix.n.includes(t)) || (compact && ix.c.includes(compact));
  };

  function setStar(btn, on, title) {
    btn.classList.toggle('is-fav', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', (on ? 'Remove from favorites: ' : 'Add to favorites: ') + title);
    btn.title = on ? 'Unfavorite' : 'Favorite';
  }
  function makeCard(item) {
    const el = document.createElement('div');
    el.className = 'grid-item';
    el.dataset.key = keyOf(item);
    const img = document.createElement('img');
    img.src = item.img; img.alt = item.title; img.loading = 'lazy'; img.decoding = 'async';
    const glare = document.createElement('span');
    glare.className = 'glare'; glare.setAttribute('aria-hidden', 'true');
    const star = document.createElement('button');
    star.type = 'button'; star.className = 'fav-star'; star.innerHTML = ELITE_STAR_SVG;
    setStar(star, favs.includes(keyOf(item)), item.title);
    const info = document.createElement('div');
    info.className = 'info'; info.textContent = item.title;
    el.append(img, glare, star, info);
    return el;
  }

  const allLazy = createLazyGrid(allBox, makeCard);
  const favLazy = createLazyGrid(favBox, makeCard);

  function updateMeta(visibleAll) {
    if (visibleAll != null) {
      if (count) count.textContent = query ? `${visibleAll} of ${data.length} ${noun}` : `${data.length} ${noun}`;
      if (allCount) allCount.textContent = String(visibleAll);
      if (none) {
        none.hidden = visibleAll !== 0;
        none.textContent = data.length ? `No ${noun} found. Try another search.` : 'Nothing here yet.';
      }
    }
    const shownFavs = favLazy.size();
    if (favCount) favCount.textContent = String(shownFavs);
    if (favEmpty) {
      favEmpty.hidden = shownFavs > 0;
      favEmpty.textContent = favs.length
        ? 'No favorites match your search.'
        : `No favorites yet. Tap the star on any ${noun.replace(/s$/, '')} to pin it here.`;
    }
    if (clear) clear.hidden = !query;
  }

  function refresh() {
    const vis = order.filter(matches);
    allLazy.setList(vis);
    favLazy.setList(favs.map(k => byKey.get(k)).filter(matches));
    updateMeta(vis.length);
  }

  function toggleFav(item) {
    const key = keyOf(item), i = favs.indexOf(key), on = i < 0;
    if (on) { favs.push(key); favLazy.add(item); } else { favs.splice(i, 1); favLazy.remove(item); }
    saveFavs();
    [allBox, favBox].forEach(box => box.querySelectorAll('.grid-item').forEach(card => {
      if (card.dataset.key !== key) return;
      const s = card.querySelector('.fav-star'); if (!s) return;
      setStar(s, on, item.title);
      if (on) { s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
    }));
    updateMeta(null);
  }

  function onClick(e) {
    const card = e.target.closest('.grid-item');
    if (!card) return;
    const item = byKey.get(card.dataset.key);
    if (!item) return;
    if (e.target.closest('.fav-star')) { e.stopPropagation(); toggleFav(item); return; }
    openCloakedTab(item.htmlUrl);
  }
  allBox.addEventListener('click', onClick);
  favBox.addEventListener('click', onClick);

  let t = 0;
  input?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { query = input.value.trim().toLocaleLowerCase(); refresh(); }, 90);
  });
  const reset = () => { input.value = ''; query = ''; refresh(); };
  input?.addEventListener('keydown', e => { if (e.key === 'Escape') { reset(); input.blur(); } });
  clear?.addEventListener('click', () => { reset(); input.focus(); });

  rand?.addEventListener('click', () => {
    if (!data.length) return;
    const pick = data[Math.floor(Math.random() * data.length)];
    rand.classList.remove('spin'); void rand.offsetWidth; rand.classList.add('spin');
    openCloakedTab(pick.htmlUrl);
  });
  refresh();
}

/* collapsible "Favorites" / "All" dropdown headers (open/closed state is remembered) */
(function eliteSections() {
  document.querySelectorAll('.grid-section').forEach(sec => {
    const toggle = sec.querySelector('.section-toggle'), body = sec.querySelector('.section-body');
    if (!toggle || !body) return;
    const KEY = 'elite_sec_' + sec.id;
    const set = (open, animate) => {
      toggle.setAttribute('aria-expanded', String(open));
      clearTimeout(body._closeTimer);
      if (open) { body.classList.remove('closing'); body.hidden = false; }
      else if (animate && !body.hidden) {
        body.classList.add('closing');
        body._closeTimer = setTimeout(() => { body.hidden = true; body.classList.remove('closing'); }, 200);
      } else body.hidden = true;
    };
    let open = true; try { open = localStorage.getItem(KEY) !== '0'; } catch {}
    set(open, false);
    toggle.addEventListener('click', () => {
      const next = toggle.getAttribute('aria-expanded') !== 'true';
      set(next, true);
      try { localStorage.setItem(KEY, next ? '1' : '0'); } catch {}
    });
  });
})();

// Initialize UI Elements
eliteLibrary({
  data: grid1Data, noun: 'games', store: 'elite_favs_games',
  ids: { all: 'grid1-container', fav: 'grid1-fav', search: 'gamesSearch', clear: 'gamesSearchClear', count: 'gamesCount',
         none: 'gamesNoResults', favCount: 'gamesFavCount', allCount: 'gamesAllCount', favEmpty: 'gamesFavEmpty', rand: 'gamesRandom' }
});
buildVideoGrid("grid2-container", movieGridData);
renderShortcuts();
createTab(); 
switchView('home'); 
window.addEventListener('resize', updateTopOffsets);

// ONEKO MOD: upload oneko.gif to GitHub, then replace this URL with its raw.githubusercontent.com link.
// The bundled local GIF works immediately if you upload it alongside index.html.
const ONEKO_SPRITE_URL = 'https://raw.githubusercontent.com/xxuep1/elite/main/oneko.gif';
const onekoFrames = {
  idle: [[-3,-3]], alert: [[-7,-3]], scratch: [[-5,0],[-6,0],[-7,0]],
  tired: [[-3,-2]], sleeping: [[-2,0],[-2,-1]],
  N: [[-1,-2],[-1,-3]], NE: [[0,-2],[0,-3]],
  E: [[-3,0],[-3,-1]], SE: [[-5,-1],[-5,-2]],
  S: [[-6,-3],[-7,-2]], SW: [[-5,-3],[-6,-1]],
  W: [[-4,-2],[-4,-3]], NW: [[-1,0],[-1,-1]]
};
let activeOneko = null;
function setOnekoMod(enabled) {
  if (!enabled) {
    if (!activeOneko) return;
    clearInterval(activeOneko.timer);
    document.removeEventListener('pointermove', activeOneko.onMove);
    activeOneko.el.remove();
    activeOneko = null;
    return;
  }
  if (activeOneko) return;
  const el = document.createElement('div');
  el.id = 'elite-oneko';
  el.setAttribute('aria-hidden', 'true');
  el.style.backgroundImage = `url(${JSON.stringify(ONEKO_SPRITE_URL)})`;
  document.body.appendChild(el);
  let x = Math.min(window.innerWidth - 16, 32);
  let y = Math.min(window.innerHeight - 16, 32);
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let frames = 0, idleTime = 0, idleAnimation = null, idleFrame = 0;
  const speed = 10;
  const onMove = event => { targetX = event.clientX; targetY = event.clientY; };
  document.addEventListener('pointermove', onMove, { passive: true });
  const setSprite = (name, index = 0) => {
    const sprites = onekoFrames[name] || onekoFrames.idle;
    const [sx,sy] = sprites[index % sprites.length];
    el.style.backgroundPosition = `${sx * 32}px ${sy * 32}px`;
  };
  const tick = () => {
    frames++;
    const dx = x - targetX, dy = y - targetY;
    const dist = Math.hypot(dx, dy);
    if (dist < 48) {
      idleTime++;
      if (idleTime > 10 && !idleAnimation && Math.random() < 1/200) {
        idleAnimation = Math.random() < .5 ? 'sleeping' : 'scratch';
        idleFrame = 0;
      }
      if (idleAnimation === 'sleeping') {
        setSprite(idleFrame < 8 ? 'tired' : 'sleeping', Math.floor(idleFrame / 4));
        if (idleFrame > 192) { idleAnimation = null; idleFrame = 0; }
        else idleFrame++;
      } else if (idleAnimation === 'scratch') {
        setSprite('scratch', idleFrame++);
        if (idleFrame > 9) { idleAnimation = null; idleFrame = 0; }
      } else setSprite('idle');
      return;
    }
    idleAnimation = null; idleFrame = 0;
    if (idleTime > 1) {
      setSprite('alert'); idleTime = Math.min(idleTime, 7) - 1;
      return;
    }
    let direction = dy / dist > .5 ? 'N' : dy / dist < -.5 ? 'S' : '';
    direction += dx / dist > .5 ? 'W' : dx / dist < -.5 ? 'E' : '';
    setSprite(direction, frames);
    x -= dx / dist * Math.min(speed, dist);
    y -= dy / dist * Math.min(speed, dist);
    x = Math.max(16, Math.min(window.innerWidth - 16, x));
    y = Math.max(16, Math.min(window.innerHeight - 16, y));
    el.style.left = `${x - 16}px`;
    el.style.top = `${y - 16}px`;
  };
  setSprite('idle');
  const timer = setInterval(tick, 100);
  activeOneko = {el, timer, onMove};
}


// WALLPAPER PARALLAX MOD: the wallpaper moves to an oversized layer that eases toward the cursor.
let activeParallax = null;
function setParallaxMod(enabled) {
  if (!enabled) {
    if (!activeParallax) return;
    cancelAnimationFrame(activeParallax.raf);
    document.removeEventListener('pointermove', activeParallax.onMove);
    activeParallax.el.remove();
    document.documentElement.classList.remove('elite-parallax-on');
    activeParallax = null;
    return;
  }
  if (activeParallax) return;
  const el = document.createElement('div');
  el.id = 'elite-parallax-bg';
  el.setAttribute('aria-hidden', 'true');
  document.body.prepend(el);
  document.documentElement.classList.add('elite-parallax-on');
  const MAX = 28;                 // px the wallpaper can drift (layer overhangs the screen by 40px)
  let tx = 0, ty = 0, cx = 0, cy = 0;
  const state = { el, raf: 0, onMove: null };
  const loop = () => {
    cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07;
    el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
    if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) state.raf = requestAnimationFrame(loop);
    else state.raf = 0;
  };
  state.onMove = e => {
    tx = -((e.clientX / window.innerWidth) - 0.5) * 2 * MAX;
    ty = -((e.clientY / window.innerHeight) - 0.5) * 2 * MAX;
    if (!state.raf) state.raf = requestAnimationFrame(loop);
  };
  document.addEventListener('pointermove', state.onMove, { passive: true });
  activeParallax = state;
}

// DDLC STICKERS MOD: sayori, natsuki and yuri idle-bob in the bottom right and hop at random.
const DDLC_STICKER_BASE = 'https://raw.githubusercontent.com/xxuep1/ddlc-stickers/main/';
const DDLC_STICKERS = ['sayoristicker.png', 'natsukistickerfixed.png', 'yuristickerfixed.png'];
const YURI_SCARY_FILE = 'yuriscarystickerfixed.png';   // each hop, yuri has a chance to swap to this for good (until the page is refreshed)
let yuriIsScary = false;                          // stays true even if the mod is toggled off and on
let activeStickers = null;
function setDdlcStickersMod(enabled) {
  if (!enabled) {
    if (!activeStickers) return;
    cancelAnimationFrame(activeStickers.raf);
    activeStickers.el.remove();
    activeStickers = null;
    return;
  }
  if (activeStickers) return;
  const wrap = document.createElement('div');
  wrap.id = 'elite-ddlc-stickers';
  wrap.setAttribute('aria-hidden', 'true');
  const rnd = (a, b) => a + Math.random() * (b - a);
  new Image().src = DDLC_STICKER_BASE + YURI_SCARY_FILE;   // preload so the swap is instant
  const startHop = (c, now) => {
    c.hop = { start: now, dur: rnd(460, 760), h: rnd(14, 38), dx: rnd(-8, 8), spin: rnd(-9, 9) };
    // yuri: chance to turn into the scary sticker, and she stays that way until the page is refreshed
    if (c.isYuri && !yuriIsScary && Math.random() < 1 / 8) {
      yuriIsScary = true;
      c.img.src = DDLC_STICKER_BASE + YURI_SCARY_FILE;
    }
  };
  const chars = DDLC_STICKERS.map(file => {
    const slot = document.createElement('div');
    slot.className = 'ddlc-slot';
    const img = document.createElement('img');
    img.alt = ''; img.draggable = false;
    img.addEventListener('load', () => img.classList.add('ready'));
    img.src = DDLC_STICKER_BASE + (file.startsWith('yuri') && yuriIsScary ? YURI_SCARY_FILE : file);
    slot.append(img);
    wrap.append(slot);
    const c = {
      slot, img, isYuri: file.startsWith('yuri'), hop: null, phase: rnd(0, 6.28), bobSpeed: rnd(1.3, 2.2), bobAmp: rnd(1.5, 3.4),
      swaySpeed: rnd(.7, 1.3), swayAmp: rnd(1.2, 3), driftSpeed: rnd(.35, .7),
      nextHop: performance.now() + rnd(500, 3000)
    };
    slot.addEventListener('click', () => { if (!c.hop) startHop(c, performance.now()); });
    return c;
  });
  document.body.appendChild(wrap);
  const state = { el: wrap, raf: 0 };
  const frame = now => {
    const t = now / 1000;
    for (const c of chars) {
      if (!c.hop && now >= c.nextHop) {
        startHop(c, now);
        // sometimes a neighbour joins in a moment later
        if (Math.random() < .3) {
          const other = chars[Math.floor(Math.random() * chars.length)];
          if (other !== c && !other.hop) other.nextHop = now + rnd(80, 380);
        }
      }
      let y = Math.sin(t * c.bobSpeed + c.phase) * c.bobAmp;
      let x = Math.sin(t * c.driftSpeed + c.phase * 2.3) * 3;
      let rot = Math.sin(t * c.swaySpeed + c.phase * 1.7) * c.swayAmp;
      let sy = 1 + Math.sin(t * c.bobSpeed + c.phase) * .012;
      if (c.hop) {
        const hp = c.hop, p = (now - hp.start) / hp.dur;
        if (p >= 1) { c.hop = null; c.nextHop = now + (Math.random() < .25 ? rnd(120, 300) : rnd(1400, 4600)); }
        else if (p < .14) { sy = 1 - .1 * (p / .14); }
        else if (p < .86) {
          const q = (p - .14) / .72;
          y = -4 * hp.h * q * (1 - q);
          x += hp.dx * q; rot += hp.spin * Math.sin(q * Math.PI);
          sy = .9 + .22 * Math.sin(q * Math.PI);
        } else {
          const k = (p - .86) / .14;
          x += hp.dx; sy = 1 - .1 * (1 - k) * Math.cos(k * Math.PI * 2);
        }
      }
      const sx = 1 / sy;
      c.slot.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    }
    state.raf = requestAnimationFrame(frame);
  };
  state.raf = requestAnimationFrame(frame);
  activeStickers = state;
}

// Add new mod definitions here. Each mod has a unique id, display name, description and optional apply(enabled) callback.
const eliteMods = [
  { id: 'oneko', name: 'Oneko Cat', description: 'the best cursor addon ever. use it. now.', apply: setOnekoMod },
  { id: 'wallpaper-parallax', name: 'Moving Wallpaper', description: 'wallpaper moves with cursor', apply: setParallaxMod },
  { id: 'ddlc-stickers', name: 'Writing a Poem', description: 'sayori, natsuki and yuri watching you', apply: setDdlcStickersMod }
];
const modSearch = document.getElementById('modSearch');
const modDropdown = document.getElementById('modDropdown');
const modToggle = document.getElementById('modDropdownToggle');
const installedMods = document.getElementById('installedMods');
const modCount = document.getElementById('modCount');
let activeModIds;
try { activeModIds = JSON.parse(localStorage.getItem('elite_enabled_mods') || '[]'); } catch { activeModIds = []; }
if (!Array.isArray(activeModIds)) activeModIds = [];
activeModIds = activeModIds.filter(id => eliteMods.some(mod => mod.id === id));
function saveMods() { localStorage.setItem('elite_enabled_mods', JSON.stringify(activeModIds)); }
function applyMods() {
  eliteMods.forEach(mod => {
    const enabled = activeModIds.includes(mod.id);
    if (mod.className) document.body.classList.toggle(mod.className, enabled);
    if (typeof mod.apply === 'function') mod.apply(enabled);
  });
}
function renderMods() {
  if (!modDropdown || !installedMods) return;
  modDropdown.replaceChildren();
  const query = (modSearch?.value || '').trim().toLowerCase();
  const matches = eliteMods.filter(mod => (mod.name + ' ' + mod.description).toLowerCase().includes(query));
  for (const mod of matches) {
    const chosen = activeModIds.includes(mod.id);
    const option = document.createElement('button');
    option.type = 'button'; option.className = 'mod-option';
    const label = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = mod.name;
    const description = document.createElement('small'); description.textContent = mod.description;
    label.append(name,description);
    const state = document.createElement('span'); state.textContent = chosen ? '✓ Added' : '+ Add';
    option.append(label,state);
    option.addEventListener('click', () => {
      activeModIds = chosen ? activeModIds.filter(id => id !== mod.id) : [...activeModIds, mod.id];
      saveMods(); applyMods(); renderMods();
      if (modSearch) modSearch.focus();
    });
    modDropdown.append(option);
  }
  if (!matches.length) { const empty = document.createElement('div'); empty.className = 'mod-empty'; empty.style.padding = '14px'; empty.textContent = 'No matching mods.'; modDropdown.append(empty); }
  installedMods.replaceChildren();
  if (!activeModIds.length) { const empty = document.createElement('div'); empty.className = 'mod-empty'; empty.textContent = 'No mods added yet.'; installedMods.append(empty); }
  activeModIds.forEach(id => {
    const mod = eliteMods.find(m => m.id === id); if (!mod) return;
    const chip = document.createElement('div'); chip.className = 'mod-chip';
    const label = document.createElement('span'); label.textContent = mod.name;
    const remove = document.createElement('button'); remove.type='button'; remove.textContent='×'; remove.title = 'Remove ' + mod.name;
    remove.addEventListener('click', () => { activeModIds = activeModIds.filter(x => x !== id); saveMods(); applyMods(); renderMods(); });
    chip.append(label,remove); installedMods.append(chip);
  });
  if (modCount) modCount.textContent = activeModIds.length + ' installed';
}
function showModDropdown(show) { if (modDropdown) modDropdown.hidden = !show; modToggle?.setAttribute('aria-expanded', String(show)); }
modSearch?.addEventListener('input', () => { renderMods(); showModDropdown(true); });
modSearch?.addEventListener('focus', () => showModDropdown(true));
modToggle?.addEventListener('click', () => showModDropdown(modDropdown.hidden));
document.addEventListener('click', e => { if (!e.target.closest('.mod-picker')) showModDropdown(false); });
applyMods(); renderMods();


/* =====================================================================
   SIDEBAR OPEN / CLOSE  (CSS does the smooth part, this just flips a class)
   ===================================================================== */
(function eliteSidebar() {
  const root = document.documentElement;
  const toggle = document.getElementById('sidebarToggle');
  const KEY = 'elite_sidebar_collapsed';
  function set(collapsed, save = true) {
    root.classList.toggle('sidebar-collapsed', collapsed);
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Open sidebar' : 'Close sidebar');
    }
    if (save) { try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch {} }
    // keep the browser iframe sizing correct while the width animates
    const t0 = performance.now();
    (function follow(now) {
      if (typeof updateTopOffsets === 'function') updateTopOffsets();
      if (now - t0 < 800) requestAnimationFrame(follow);
    })(t0);
  }
  toggle?.addEventListener('click', () => set(!root.classList.contains('sidebar-collapsed')));
  let saved = false; try { saved = localStorage.getItem(KEY) === '1'; } catch {}
  if (saved) {
    // start collapsed without playing the animation
    root.style.transition = 'none';
    set(true, false);
    requestAnimationFrame(() => requestAnimationFrame(() => { root.style.transition = ''; }));
  }
})();

/* =====================================================================
   GRID CARD PHYSICS (spring tilt + lift + press + glare), same feel as buttonconcept.mp4
   ===================================================================== */
(function eliteCardPhysics() {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const STIFF = 190, DAMP = 13;          // lower damping = more wobble
  const MAX_TILT = 13, HOVER_SCALE = 1.055, PRESS_SCALE = .965;
  const states = new WeakMap();          // card -> state
  const ON = new Set();                  // cards currently animating
  const root = document.documentElement;
  let hovered = null, raf = 0, last = 0;
  let pointer = { x: 0, y: 0 }, pending = false;
  let rectVer = 0;                       // bumps on scroll/resize so cached geometry is refreshed
  let lite = false, frames = 0, slow = 0; // adaptive quality (drops glare + image parallax if frames are slow)

  const invalidate = () => { rectVer++; };
  document.addEventListener('scroll', invalidate, { capture: true, passive: true });
  window.addEventListener('resize', invalidate, { passive: true });

  function stateOf(card) {
    let s = states.get(card);
    if (!s) {
      s = { card, img: card.querySelector('img'), glare: card.querySelector('.glare'),
        hover: false, down: false, ver: -1, cx: 0, cy: 0, w: 1, h: 1,
        rx: {x:0,v:0,t:0}, ry: {x:0,v:0,t:0}, sc: {x:1,v:0,t:1}, px: {x:0,v:0,t:0}, py: {x:0,v:0,t:0} };
      states.set(card, s);
    }
    return s;
  }
  function wake(s) {
    if (!ON.has(s)) { ON.add(s); s.card.classList.add('is-animating'); }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function disabled() { return document.body.classList.contains('mod-no-animations'); }

  // geometry is only measured when stale (not on every pointermove)
  function measure(s) {
    const r = s.card.getBoundingClientRect();
    s.cx = r.left + r.width / 2;
    s.cy = r.top + r.height / 2 + (s.sc.x - 1) * 150;   // undo current lift so the center stays stable
    s.w = s.card.offsetWidth || r.width || 1;
    s.h = s.card.offsetHeight || r.height || 1;
    s.ver = rectVer;
  }
  function aim(s) {
    if (s.ver !== rectVer) measure(s);
    const nx = Math.max(-.5, Math.min(.5, (pointer.x - s.cx) / s.w));
    const ny = Math.max(-.5, Math.min(.5, (pointer.y - s.cy) / s.h));
    s.ry.t = nx * 2 * MAX_TILT;
    s.rx.t = -ny * 2 * MAX_TILT;
    s.px.t = nx * 2; s.py.t = ny * 2;
    s.sc.t = s.down ? PRESS_SCALE : HOVER_SCALE;
  }
  function enter(card) {
    const s = stateOf(card); s.hover = true;
    card.classList.add('is-tilting');
    s.sc.v += 1.1;                        // little pop on entry
    s.ver = -1; aim(s); wake(s);
  }
  function leave(card) {
    const s = stateOf(card); s.hover = false; s.down = false;
    card.classList.remove('is-tilting');
    s.rx.t = s.ry.t = s.px.t = s.py.t = 0; s.sc.t = 1;
    s.sc.v -= .6;                         // slight undershoot on exit
    wake(s);
  }

  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || disabled()) return;
    pointer.x = e.clientX; pointer.y = e.clientY;
    const card = e.target.closest && e.target.closest('.grid-item');
    if (card !== hovered) {
      if (hovered) leave(hovered);
      hovered = card || null;
      if (hovered) enter(hovered);
    } else if (hovered) {
      pending = true;                     // aimed once per frame inside tick()
      wake(stateOf(hovered));
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (hovered) { leave(hovered); hovered = null; } });
  window.addEventListener('blur', () => { if (hovered) { leave(hovered); hovered = null; } });
  document.addEventListener('pointerdown', e => {
    if (disabled()) return;
    const card = e.target.closest && e.target.closest('.grid-item'); if (!card) return;
    const s = stateOf(card); s.down = true; s.sc.t = PRESS_SCALE; wake(s);
  });
  const release = () => ON.forEach(s => { if (s.down) { s.down = false; s.sc.t = s.hover ? HOVER_SCALE : 1; s.sc.v += .5; wake(s); } });
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);

  function step(p, dt) {
    const a = STIFF * (p.t - p.x) - DAMP * p.v;
    p.v += a * dt; p.x += p.v * dt;
  }
  const settled = p => Math.abs(p.t - p.x) < .0008 && Math.abs(p.v) < .01;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  function clearFx(s) {
    s.card.style.transform = '';
    if (s.img) s.img.style.transform = '';
    if (s.glare) s.glare.style.opacity = '';
    if (s.glare) s.glare.style.transform = '';
    s.card.classList.remove('is-animating');
  }

  function tick(now) {
    const raw = (now - last) / 1000 || .016; last = now;
    const dt = Math.min(.032, raw);

    // adaptive quality: if the device can't hold ~30fps, drop the extras (tilt + lift + press stay)
    if (!lite && ++frames > 3) {
      if (raw > .034) slow++;
      if (frames >= 40) {
        if (slow > 14) { lite = true; root.classList.add('cards-lite'); ON.forEach(s => { if (s.img) s.img.style.transform = ''; }); }
        frames = 0; slow = 0;
      }
    }

    if (pending && hovered) { aim(stateOf(hovered)); pending = false; }

    for (const s of ON) {
      step(s.rx, dt); step(s.ry, dt); step(s.sc, dt); step(s.px, dt); step(s.py, dt);
      const lift = (s.sc.x - 1) * 150;
      s.card.style.transform = `perspective(900px) translate3d(0,${(-lift).toFixed(2)}px,0) rotateX(${s.rx.x.toFixed(2)}deg) rotateY(${s.ry.x.toFixed(2)}deg) scale(${s.sc.x.toFixed(4)})`;
      if (!lite) {
        const g = clamp01((s.sc.x - 1) / (HOVER_SCALE - 1));
        if (s.img) s.img.style.transform = `scale(${(1 + g * .08).toFixed(4)}) translate3d(${(s.px.x * -7).toFixed(2)}px,${(s.py.x * -5).toFixed(2)}px,0)`;
        if (s.glare) {
          s.glare.style.transform = `translate3d(${(s.px.x * 25).toFixed(2)}%,${(s.py.x * 25).toFixed(2)}%,0)`;
          s.glare.style.opacity = g.toFixed(3);
        }
      }
      if (!s.hover && !s.down && settled(s.rx) && settled(s.ry) && settled(s.sc) && settled(s.px) && settled(s.py)) {
        clearFx(s);
        ON.delete(s);
      }
    }
    raf = ON.size ? requestAnimationFrame(tick) : 0;
  }
})();


/* =====================================================================
   APPS PAGE: a second page that works exactly like the games page.
   Add entries to grid3Data (same shape as the games list).
   ===================================================================== */
const grid3Data = [
  { title: "eliteTube (w.i.p)", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/elitetubee.jpg", htmlUrl: "https://raw.githubusercontent.com/xxuep1/elite/main/elitetube.html" },
  { title: "eliteOS", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/eliteoss.jpg", htmlUrl: "https://raw.githubusercontent.com/xxuep1/elite/main/eliteos.html" },
  { title: "Gn-Math", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/gnmathh.jpg", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/gn.html" },
  { title: "Horizon", img: "https://raw.githubusercontent.com/xxuep/xxuep-icons/main/horizonbigger.png", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/horizon.html" },
  { title: "HTML Editor", img: "https://raw.githubusercontent.com/xxuep/xxuep-icons/main/htmleditor.png", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/live-code-editor.html" },
  { title: "Text to Speech", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ttstool.png", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/tts.html" },
  { title: "T!tan (a, a)", img: "https://raw.githubusercontent.com/xxuep/xxuep-icons/main/titanlogo.png", htmlUrl: "https://raw.githubusercontent.com/sad-shady/sad-project/main/homework-2-27.html" },
  { title: "UGS", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/ugss.png", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/ugs.html" },
  { title: "Zetify", img: "https://raw.githubusercontent.com/xxuep/offline-game-thumbnails/main/zetifyy.png", htmlUrl: "https://raw.githubusercontent.com/xxuep1/randomgames/main/zetify.html" },
];
(function setupAppsPage() {
  eliteLibrary({
    data: grid3Data, noun: 'apps', store: 'elite_favs_apps',
    ids: { all: 'grid3-container', fav: 'grid3-fav', search: 'appsSearch', clear: 'appsSearchClear', count: 'appsCount',
           none: 'appsNoResults', favCount: 'appsFavCount', allCount: 'appsAllCount', favEmpty: 'appsFavEmpty', rand: 'appsRandom' }
  });
})();

/* =====================================================================
   SELECT DROPDOWNS -> same look as the mods picker
   The real <select> stays in the page (hidden) as the source of truth.
   ===================================================================== */
(function eliteSelectPickers() {
  const pickers = [];
  document.querySelectorAll('.settings-group select').forEach(select => {
    const wrap = document.createElement('div');
    wrap.className = 'mod-picker select-picker';
    const input = document.createElement('input');
    input.type = 'text'; input.readOnly = true; input.className = 'picker-input';
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-label', select.getAttribute('aria-label') || (document.querySelector(`label[for="${select.id}"]`)?.textContent.trim()) || 'Select');
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'picker-toggle'; toggle.textContent = '\u2304';
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Show options');
    const menu = document.createElement('div');
    menu.className = 'mod-dropdown'; menu.hidden = true; menu.setAttribute('role', 'listbox');
    wrap.append(input, toggle, menu);
    select.classList.add('native-hidden');
    select.after(wrap);

    const show = on => { menu.hidden = !on; toggle.setAttribute('aria-expanded', String(on)); };
    function sync() {
      const current = select.options[select.selectedIndex];
      input.value = current ? current.textContent : '';
      menu.replaceChildren();
      [...select.options].forEach(opt => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'mod-option' + (opt.value === select.value ? ' is-current' : '');
        b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(opt.value === select.value));
        const label = document.createElement('span');
        const name = document.createElement('strong'); name.textContent = opt.textContent;
        label.append(name);
        const state = document.createElement('span'); state.textContent = opt.value === select.value ? '\u2713 Selected' : '';
        b.append(label, state);
        b.addEventListener('click', () => {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          sync(); show(false);
        });
        menu.append(b);
      });
    }
    input.addEventListener('click', () => show(menu.hidden));
    input.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); show(true); } if (e.key === 'Escape') show(false); });
    toggle.addEventListener('click', () => show(menu.hidden));
    select.addEventListener('change', sync);
    pickers.push({ wrap, show, sync });
    sync();
  });
  document.addEventListener('click', e => { pickers.forEach(p => { if (!p.wrap.contains(e.target)) p.show(false); }); });
})();

/* =====================================================================
   SETUP POPUP + DESKTOP LAYOUT
   EASY SETUP: edit ICONS to change the tab-icon grid. Each entry is an emoji OR an image link (https://... / data:...).
   ===================================================================== */
(() => {
'use strict';
const ICONS = ['https://raw.githubusercontent.com/xxuep1/randomicons/main/googleclassroom.png','https://raw.githubusercontent.com/xxuep1/randomicons/main/clever.png','https://raw.githubusercontent.com/xxuep1/randomicons/main/ixl.png','https://raw.githubusercontent.com/xxuep1/randomicons/main/khanacademy.png'];

const LS = localStorage, q = s => document.querySelector(s);
const mk = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const get = (k, d) => { try { const v = JSON.parse(LS.getItem(k)); return v == null ? d : v; } catch { return d; } };
const set = (k, v) => LS.setItem(k, JSON.stringify(v));
const track = (e, move, end) => {
  const sx = e.clientX, sy = e.clientY;
  const m = ev => move(ev.clientX - sx, ev.clientY - sy, ev);
  const u = ev => { removeEventListener('pointermove', m); removeEventListener('pointerup', u); end && end(ev); };
  addEventListener('pointermove', m); addEventListener('pointerup', u);
};

/* ---------- tab icon + name ---------- */
function favicon(icon) {
  let url = icon;
  if (!/^(https?:|data:)/.test(icon)) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.font = '50px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(icon, 32, 36);
    url = c.toDataURL();
  }
  let l = q('link[rel~="icon"]');
  if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
  l.href = url;
}
function applyIdentity() { const i = get('elite_tab_icon'), n = get('elite_tab_name'); if (i) favicon(i); if (n) document.title = n; }

/* ---------- layout cards (setup popup, settings page, home panel) ---------- */
const PREV = {
  standard: '<div class="lp lp-std"><i class="a"></i><i class="b"></i></div>',
  desktop: '<div class="lp lp-dsk"><i class="a"></i><i class="b"></i><i class="c"></i></div>'
};
function syncLayoutCards() {          // every live switcher always shows the layout that is really active
  const now = get('elite_layout', 'standard');
  document.querySelectorAll('.es-layouts.live .es-lay').forEach(c => c.classList.toggle('sel', c.dataset.id === now));
}
function layoutCards(cur, pick, live) {
  const wrap = mk('div', 'es-layouts' + (live ? ' live' : ''));
  [['standard', 'Standard', 'Sidebar and pages'], ['desktop', 'Desktop', 'Windows and a taskbar']].forEach(([id, t, s]) => {
    const c = mk('button', 'es-lay' + (id === cur ? ' sel' : ''), `<span class="es-chk">✓</span>${PREV[id]}<b>${t}</b><small>${s}</small>`);
    c.type = 'button'; c.dataset.id = id;
    c.onclick = () => { wrap.querySelectorAll('.es-lay').forEach(x => x.classList.toggle('sel', x === c)); pick(id); if (live) syncLayoutCards(); };
    wrap.appendChild(c);
  });
  return wrap;
}
let switching = false, deskOff = null;
function switchLayout(id) {          // swaps live behind a loading screen (no reload, so about:blank cloaks never go blank)
  if (switching || id === get('elite_layout', 'standard')) { syncLayoutCards(); return; }
  switching = true; set('elite_layout', id); syncLayoutCards();
  const ov = mk('div', 'es-loading', '<div class="es-spin"></div><b>switching layout…</b>');
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('on'));
  setTimeout(() => {
    try {
      if (id === 'desktop') { if (!deskOff) deskOff = initDesktop(); }
      else if (deskOff) { deskOff(); deskOff = null; }
    } catch (err) { console.error('layout switch failed', err); }
    setTimeout(() => { ov.classList.remove('on'); setTimeout(() => { ov.remove(); switching = false; }, 350); }, 500);
  }, 380);
}

/* ---------- setup popup ---------- */
function setup(done) {
  let icon = get('elite_tab_icon', ICONS[0]), layout = get('elite_layout', 'standard');
  const ov = mk('div', 'es-overlay'), card = mk('div', 'es-card');
  card.innerHTML = '<h2>set up elite</h2><p>make it yours. you can switch layouts later.</p>' +
    '<div class="es-label"><span>1</span>ICON</div><div class="es-icons"></div>' +
    '<div class="es-label"><span>2</span>TAB NAME</div><input class="es-name" maxlength="40" placeholder="elite" spellcheck="false">' +
    '<div class="es-label"><span>3</span>LAYOUT</div><div class="es-lslot"></div>' +
    '<button class="es-go" type="button">continue →</button>';
  const grid = card.querySelector('.es-icons');
  ICONS.forEach(ic => {
    const b = mk('button', 'es-ic' + (ic === icon ? ' sel' : '')); b.type = 'button';
    if (/^(https?:|data:)/.test(ic)) { const i = new Image(); i.src = ic; b.appendChild(i); } else b.textContent = ic;
    b.onclick = () => { icon = ic; grid.querySelectorAll('.es-ic').forEach(x => x.classList.toggle('sel', x === b)); favicon(ic); };
    grid.appendChild(b);
  });
  const name = card.querySelector('.es-name'); name.value = get('elite_tab_name', '');
  name.oninput = () => { document.title = name.value || 'elite'; };
  card.querySelector('.es-lslot').appendChild(layoutCards(layout, id => layout = id));
  card.querySelector('.es-go').onclick = () => {
    set('elite_tab_icon', icon); set('elite_tab_name', name.value.trim() || 'elite'); set('elite_layout', layout); set('elite_setup_done', 1);
    applyIdentity(); ov.classList.add('out');
    setTimeout(() => { ov.remove(); done && done(layout); }, 450);
  };
  ov.appendChild(card); document.body.appendChild(ov);
}

/* ---------- desktop ---------- */
function initDesktop() {
  const B = document.body;
  if (typeof switchView === 'function') switchView('home');   // reset whatever standard page/browser was showing
  B.classList.add('layout-desktop');
  const dsk = mk('div', 'dsk', '<div class="dsk-clock"><div class="dsk-time"></div><div class="dsk-date"></div><div class="dsk-day"></div></div>');
  B.appendChild(dsk);
  const tE = q('.dsk-time'), dE = q('.dsk-date'), wE = q('.dsk-day');
  const tick = () => { const n = new Date();
    tE.textContent = n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    dE.textContent = n.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    wE.textContent = n.toLocaleDateString([], { weekday: 'long' }); };
  tick(); const tickId = setInterval(tick, 1000);

  // every sidebar page becomes an app (the page elements are moved, not copied, so they stay untouched)
  const APPS = [['home','Home','home-page','nav-home'],['browser','Browser','','nav-browser'],['games','Games','page2','nav-page2'],['apps','Apps','page4','nav-page4'],['settings','Settings','settings-page','nav-settings'],['credits','Info','credits-page','nav-credits']]
    .map(([id, name, page, nav]) => ({ id, name, page: page ? q('#' + page) : null, icon: q('#' + nav + ' img').src }));

  const hidePages = () => APPS.forEach(a => { if (a.page && !wins[a.id]) a.page.style.display = 'none'; });   // the standard layout's open page must not cover the desktop
  const wins = {};
  hidePages();

  /* browser app: the real tab bar, address bar and proxy view are moved into a window (not copied) */
  const BR = ['tabsBar', 'chromeBar', 'newtab', 'viewer', 'iframe-loading-bg'].map(id => q('#' + id));
  function mountBrowser(body) {
    const bw = mk('div', 'bw'), view = mk('div', 'bw-view');
    bw.append(BR[0], BR[1], view); view.append(BR[2], BR[3], BR[4]); body.appendChild(bw);
    if (typeof switchView === 'function') switchView('browser'); else document.body.classList.add('elite-browser-view');
    hidePages();
  }
  function unmountBrowser() {
    BR.forEach(e => { e.style.display = 'none'; document.body.appendChild(e); });
    document.body.classList.remove('elite-browser-view');
    document.querySelectorAll('.bw').forEach(e => e.remove());
  }

  /* taskbar */
  const hz = mk('div', 'tb-hz'), tb = mk('div', 'tb');
  tb.innerHTML = '<button class="tb-b tb-home" title="Home"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/></svg></button><button class="tb-b tb-search" title="Search apps"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button><div class="tb-sep"></div><div class="tb-apps"></div><div class="tb-tray"></div>';
  B.append(hz, tb);
  const mb = q('#musicBtn'); if (mb) tb.querySelector('.tb-tray').appendChild(mb);
  let tbTimer, panel = null;
  const showTb = () => { clearTimeout(tbTimer); tb.classList.add('show'); };
  const hideTb = () => { clearTimeout(tbTimer); tbTimer = setTimeout(() => { if (!panel) tb.classList.remove('show'); }, 320); };
  [hz, tb].forEach(x => { x.addEventListener('mouseenter', showTb); x.addEventListener('mouseleave', hideTb); });

  function closePanel() { if (!panel) return; const p = panel; panel = null; p.classList.add('out'); setTimeout(() => p.remove(), 220); hideTb(); }
  function openPanel(kind) {
    if (panel && panel.dataset.k === kind) return closePanel();
    if (panel) { panel.remove(); panel = null; }
    const p = mk('div', 'tb-panel'); p.dataset.k = kind; panel = p; showTb();
    if (kind === 'home') {
      p.innerHTML = '<h3>layout</h3><p>switch how elite looks</p>';
      p.appendChild(layoutCards('desktop', id => { if (id !== 'desktop') switchLayout(id); }, true));
    } else {
      p.innerHTML = '<input class="tb-q" placeholder="Search apps..." spellcheck="false"><div class="tb-res"></div>';
      const inp = p.querySelector('.tb-q'), res = p.querySelector('.tb-res');
      const draw = () => { const v = inp.value.trim().toLowerCase(); res.innerHTML = '';
        APPS.filter(a => a.name.toLowerCase().includes(v)).forEach(a => { const r = mk('button', 'tb-r', `<img src="${a.icon}"><span>${a.name}</span>`); r.onclick = () => { closePanel(); openApp(a); }; res.appendChild(r); }); };
      inp.oninput = draw; inp.onkeydown = e => { if (e.key === 'Enter') { const r = res.querySelector('.tb-r'); r && r.click(); } };
      draw(); setTimeout(() => inp.focus(), 60);
    }
    B.appendChild(p);
  }
  tb.querySelector('.tb-home').onclick = e => { e.stopPropagation(); openPanel('home'); };
  tb.querySelector('.tb-search').onclick = e => { e.stopPropagation(); openPanel('search'); };
  const onPD = e => { if (panel && !panel.contains(e.target) && !tb.contains(e.target)) closePanel(); };
  addEventListener('pointerdown', onPD);
  const onKD = e => { if (e.key === 'Escape') closePanel(); };
  addEventListener('keydown', onKD);

  /* windows */
  let zTop = 10, cascade = 0;
  const focus = w => { Object.values(wins).forEach(x => x.el.classList.toggle('focus', x === w)); w.el.style.zIndex = ++zTop; renderTb(); };
  function renderTb() {
    const box = tb.querySelector('.tb-apps'); box.innerHTML = '';
    Object.values(wins).forEach(w => {
      const b = mk('button', 'tb-app' + (w.el.classList.contains('focus') && !w.min ? ' on' : ''), `<img src="${w.app.icon}"><i></i>`);
      b.title = w.app.name; w.tbBtn = b;
      b.onclick = () => { if (w.min) restore(w); else if (w.el.classList.contains('focus')) minimize(w); else focus(w); };
      box.appendChild(b);
    });
  }
  function warp(w, back) {                 // genie-style warp to/from the taskbar icon
    const el = w.el, r = el.getBoundingClientRect(), t = (w.tbBtn || tb).getBoundingClientRect();
    const tx = t.left + t.width / 2 - (r.left + r.width / 2), ty = t.top + t.height / 2 - (r.top + r.height / 2);
    const kf = [{ transform: 'none', opacity: 1, filter: 'blur(0px)' },
      { transform: `translate(${tx * .55}px,${ty * .55}px) scale(.5,.3) skewX(-8deg)`, opacity: .85, filter: 'blur(1px)', offset: .6 },
      { transform: `translate(${tx}px,${ty}px) scale(.03,.02)`, opacity: 0, filter: 'blur(5px)' }];
    return el.animate(back ? kf.slice().reverse().map((f, i) => ({ ...f, offset: i === 1 ? .4 : i / 2 })) : kf, { duration: 560, easing: back ? 'cubic-bezier(.2,.8,.3,1)' : 'cubic-bezier(.6,0,.8,.3)' });
  }
  function minimize(w) { if (w.min) return; w.min = true; w.el.classList.remove('focus'); warp(w).onfinish = () => { w.el.style.display = 'none'; }; renderTb(); }
  function restore(w) { w.min = false; w.el.style.display = 'flex'; warp(w, true); focus(w); }
  function toggleMax(w) {
    const el = w.el; el.classList.add('anim'); setTimeout(() => el.classList.remove('anim'), 420);
    if (!w.max) { w.rect = { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; w.max = true; el.classList.add('max'); Object.assign(el.style, { left: 0, top: 0, width: '100%', height: '100%' }); }
    else { w.max = false; el.classList.remove('max', 'hdr'); Object.assign(el.style, { left: w.rect.l + 'px', top: w.rect.t + 'px', width: w.rect.w + 'px', height: w.rect.h + 'px' }); }
  }
  function close(w) {
    w.el.classList.add('closing'); delete wins[w.app.id]; renderTb();
    setTimeout(() => {
      if (w.app.id === 'browser') unmountBrowser();
      else { w.app.page.classList.remove('in-win'); w.app.page.style.display = 'none'; document.body.appendChild(w.app.page); }
      w.el.remove();
    }, 280);
  }
  function openApp(a) {
    let w = wins[a.id];
    if (w) { w.min ? restore(w) : focus(w); return; }
    const el = mk('div', 'dw', `<div class="dw-head"><span class="dw-title">${a.name}</span><div class="dw-btns"><button class="m" title="Minimize"><svg viewBox="0 0 12 12"><path d="M2 6h8"/></svg></button><button class="x" title="Maximize"><svg viewBox="0 0 12 12"><path d="M2.5 7.5v-5h5M9.5 4.5v5h-5"/></svg></button><button class="c" title="Close"><svg viewBox="0 0 12 12"><path d="m2.5 2.5 7 7m0-7-7 7"/></svg></button></div></div><div class="dw-body"></div>`);
    const big = a.id === 'browser', W = Math.min(big ? 1000 : 820, innerWidth - 120), H = Math.min(big ? 660 : 560, innerHeight - 100), off = (cascade++ % 6) * 34;
    Object.assign(el.style, { width: W + 'px', height: H + 'px', left: Math.max(20, (innerWidth - W) / 2 - 80 + off) + 'px', top: Math.max(20, (innerHeight - H) / 2 - 50 + off) + 'px' });
    ['n','s','e','w','ne','nw','se','sw'].forEach(d => { const h = mk('div', 'rz ' + d); h.dataset.d = d; el.appendChild(h); });
    if (a.id === 'browser') mountBrowser(el.querySelector('.dw-body'));
    else { a.page.classList.add('in-win'); el.querySelector('.dw-body').appendChild(a.page); }
    dsk.appendChild(el);
    w = { app: a, el, min: false, max: false }; wins[a.id] = w; focus(w);
    el.addEventListener('pointerdown', () => { if (!el.classList.contains('focus')) focus(w); });
    el.querySelector('.m').onclick = () => minimize(w);
    el.querySelector('.x').onclick = () => toggleMax(w);
    el.querySelector('.c').onclick = () => close(w);
    const head = el.querySelector('.dw-head');
    head.ondblclick = e => { if (!e.target.closest('button')) toggleMax(w); };
    head.onpointerdown = e => {
      if (e.button || e.target.closest('button') || w.max) return;
      const ox = el.offsetLeft, oy = el.offsetTop; el.classList.add('drag');
      track(e, (dx, dy) => { el.style.left = ox + dx + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 40, oy + dy)) + 'px'; }, () => el.classList.remove('drag'));
    };
    el.querySelectorAll('.rz').forEach(h => h.onpointerdown = e => {
      if (e.button || w.max) return; e.preventDefault();
      const d = h.dataset.d, L = el.offsetLeft, T = el.offsetTop, Wd = el.offsetWidth, Ht = el.offsetHeight, MW = 360, MH = 240; el.classList.add('drag');
      track(e, (dx, dy) => {
        let l = L, t = T, wd = Wd, ht = Ht;
        if (d.includes('e')) wd = Math.max(MW, Wd + dx);
        if (d.includes('s')) ht = Math.max(MH, Ht + dy);
        if (d.includes('w')) { wd = Math.max(MW, Wd - dx); l = L + Wd - wd; }
        if (d.includes('n')) { ht = Math.max(MH, Ht - dy); t = Math.max(0, T + Ht - ht); ht = T + Ht - t; }
        Object.assign(el.style, { left: l + 'px', top: t + 'px', width: wd + 'px', height: ht + 'px' });
      }, () => el.classList.remove('drag'));
    });
    el.addEventListener('pointermove', e => {   // maximized: header drops down when the mouse touches the very top
      if (!w.max) return; const y = e.clientY;
      el.classList.toggle('hdr', y < (el.classList.contains('hdr') ? 46 : 8));
    });
    el.addEventListener('pointerleave', () => el.classList.remove('hdr'));
  }

  /* shortcut icons: drag them anywhere */
  const pos = get('elite_dsk_pos', {});
  APPS.forEach((a, i) => {
    const p = pos[a.id] || { x: 28, y: 28 + i * 108 };
    const d = mk('div', 'dsk-ico', `<img src="${a.icon}" draggable="false"><span>${a.name}</span>`);
    d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; d.style.animationDelay = i * 70 + 'ms';
    d.onpointerdown = e => {
      if (e.button) return; const ox = d.offsetLeft, oy = d.offsetTop; let moved = false; d.classList.add('grab');
      track(e, (dx, dy) => { if (!moved && Math.hypot(dx, dy) < 5) return; moved = true;
        d.style.left = Math.max(0, Math.min(innerWidth - 84, ox + dx)) + 'px'; d.style.top = Math.max(0, Math.min(innerHeight - 100, oy + dy)) + 'px'; },
        () => { d.classList.remove('grab'); if (moved) { pos[a.id] = { x: d.offsetLeft, y: d.offsetTop }; set('elite_dsk_pos', pos); } else openApp(a); });
    };
    dsk.appendChild(d);
  });

  /* teardown: hands every moved element back to the standard layout */
  return function teardown() {
    clearInterval(tickId); clearTimeout(tbTimer);
    removeEventListener('pointerdown', onPD); removeEventListener('keydown', onKD);
    Object.values(wins).forEach(w => {
      if (w.app.id === 'browser') unmountBrowser();
      else { w.app.page.classList.remove('in-win'); w.app.page.style.display = 'none'; document.body.appendChild(w.app.page); }
      w.el.remove(); delete wins[w.app.id];
    });
    if (panel) { panel.remove(); panel = null; }
    const m = q('#musicBtn'), sb = q('#sidebar'); if (m) (sb || document.body).appendChild(m);   // back to the bottom of the sidebar
    dsk.remove(); hz.remove(); tb.remove();
    B.classList.remove('layout-desktop');
    if (typeof switchView === 'function') switchView('home');
  };
}

/* ---------- home quotes (edit the list in index.html > ELITE_CONFIG) ---------- */
function homeQuotes() {
  const C = window.ELITE_CONFIG || {}, list = (C.quotes || []).filter(s => typeof s === 'string' && s.trim());
  const box = q('#homeQuote'), txt = q('#homeQuoteText');
  if (!box || !txt) return;
  if (!list.length) { box.hidden = true; return; }
  let bag = [], last = -1;
  const next = () => {                                   // shuffle bag: every quote shows once before any repeats
    if (!bag.length) {
      bag = list.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [bag[i], bag[k]] = [bag[k], bag[i]]; }
      if (bag.length > 1 && bag[bag.length - 1] === last) bag.unshift(bag.pop());   // never the same quote twice in a row
    }
    return (last = bag.pop());
  };
  const show = first => {
    const t = list[next()];
    if (first) { txt.textContent = t; requestAnimationFrame(() => box.classList.add('in')); return; }
    box.classList.remove('in');
    setTimeout(() => { txt.textContent = t; box.classList.add('in'); }, 450);
  };
  show(true);
  if (list.length > 1) setInterval(() => show(false), Math.max(1, +C.quoteSeconds || 5) * 1000);
}

/* ---------- update board popup (edit it in index.html > ELITE_CONFIG) ---------- */
function updateBoard() {
  const U = (window.ELITE_CONFIG || {}).updates;
  if (!U || !Array.isArray(U.items) || !U.items.length) return;
  const id = String(U.id || 'update-1');
  if (!U.alwaysShow && get('elite_update_seen') === id) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ov = mk('div', 'ub-overlay'), card = mk('div', 'ub-card');
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', U.title || "what's new");
  card.innerHTML = '<button class="ub-x" type="button" aria-label="Close">\u00d7</button>' +
    (U.date ? '<div class="ub-tag">' + esc(U.date) + '</div>' : '') +
    '<h2>' + esc(U.title || "what's new") + '</h2>' +
    '<div class="ub-list">' + U.items.map((it, i) =>
      '<article class="ub-item" style="animation-delay:' + (0.25 + i * 0.09) + 's"><h3>' + esc(it.title) + '</h3><p>' + esc(it.text) + '</p></article>').join('') + '</div>' +
    '<button class="ub-go" type="button">got it</button>';
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => {
    if (ov.classList.contains('out')) return;
    set('elite_update_seen', id); removeEventListener('keydown', onKey);
    ov.classList.add('out'); setTimeout(() => ov.remove(), 420);
  };
  card.querySelector('.ub-x').onclick = close; card.querySelector('.ub-go').onclick = close;
  ov.onpointerdown = e => { if (e.target === ov) close(); };
  addEventListener('keydown', onKey);
  ov.appendChild(card); document.body.appendChild(ov);
  card.querySelector('.ub-go').focus({ preventScroll: true });
}

/* ---------- start ---------- */
applyIdentity();
const start = layout => { if (layout === 'desktop') deskOff = initDesktop(); };
homeQuotes();
if (!get('elite_setup_done')) setup(l => { start(l); updateBoard(); });   // first visit: setup popup, then the update board
else { start(get('elite_layout', 'standard')); updateBoard(); }
// settings page gets the layout switcher too (so you can change it from either layout)
const sp = q('#settings-page');
if (sp) { const g = mk('div', 'settings-group', '<label>Layout</label>'); g.style.marginTop = '20px';
  g.appendChild(layoutCards(get('elite_layout', 'standard'), id => { if (id !== get('elite_layout', 'standard')) switchLayout(id); }, true));
  const mods = sp.querySelector('.mods-group'); sp.insertBefore(g, mods || null);

  // tab icon + name (same choices as the setup popup, applied live)
  const t = mk('div', 'settings-group tab-id', '<label>Tab icon &amp; name</label>'); t.style.marginTop = '20px';
  const grid = mk('div', 'es-icons'), nm = mk('input', 'es-name'), cu = mk('input', 'es-name'), rs = mk('button', 'tab-id-reset', 'reset to default');
  nm.placeholder = 'tab name'; nm.maxLength = 40; nm.spellcheck = false; nm.value = get('elite_tab_name', '');
  cu.placeholder = 'custom icon link (https://...)'; cu.spellcheck = false; rs.type = 'button';
  const cur = () => get('elite_tab_icon', ICONS[0]);
  const mark = () => grid.querySelectorAll('.es-ic').forEach(x => x.classList.toggle('sel', x.dataset.ic === cur()));
  ICONS.forEach(ic => {
    const b = mk('button', 'es-ic'); b.type = 'button'; b.dataset.ic = ic;
    if (/^(https?:|data:)/.test(ic)) { const i = new Image(); i.src = ic; b.appendChild(i); } else b.textContent = ic;
    b.onclick = () => { set('elite_tab_icon', ic); favicon(ic); cu.value = ''; mark(); };
    grid.appendChild(b);
  });
  nm.oninput = () => { const v = nm.value.trim(); set('elite_tab_name', v || 'elite'); document.title = v || 'Home - Classroom'; };
  cu.onchange = () => { const v = cu.value.trim(); if (!/^(https?:|data:)/.test(v)) return; set('elite_tab_icon', v); favicon(v); mark(); };
  rs.onclick = () => { set('elite_tab_icon', ICONS[0]); set('elite_tab_name', 'elite'); favicon(ICONS[0]); document.title = 'Home - Classroom'; nm.value = ''; cu.value = ''; mark(); };
  t.append(grid, nm, cu, rs); mark();
  sp.insertBefore(t, mods || null); }
})();
