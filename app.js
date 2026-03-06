/* ============================================================
   GRADUATION MEMORY BOARD — app.js
   Full interactive logic: notes CRUD, drag-drop, filters,
   photo upload, localStorage persistence, confetti
   ============================================================ */

'use strict';

//* ===== APP STATE ===== */
let notes = [];
let currentFilter = 'all';

/* ===== FIREBASE SETUP ===== */
const firebaseConfig = {
  apiKey: "AIzaSyDEYQjSMU42w1QIBpDjfbrIo_FhY8xPjmg",
  authDomain: "graduation-board.firebaseapp.com",
  databaseURL: "https://graduation-board-default-rtdb.firebaseio.com",
  projectId: "graduation-board",
  storageBucket: "graduation-board.firebasestorage.app",
  messagingSenderId: "1028594613287",
  appId: "1:1028594613287:web:46604c899d873526572202",
  measurementId: "G-4PYB8GCZ9L"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const TYPE_LABELS = {
  message: '💌 Message',
  advice: '💡 Advice',
  memory: '⭐ Memory',
  photo: '🖼️ Photo',
};

let editingId = null;
let pendingDeleteId = null;
let selectedColor = '#fef9c3';
let selectedFont = 'Inter';
let selectedSize = 'medium';
let selectedEmoji = '';
let selectedType = 'message';
let uploadedPhotoDataUrl = null;


// ===== HELPERS =====
const $ = id => document.getElementById(id);
const formatDate = () => {
  const d = new Date();
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);


// ===== STORAGE (FIREBASE) =====
function saveNotes() {
  // We no longer save everything in bulk, Firebase handles individual saves in saveMemory()
}

function loadNotes() {
  // Listen for real-time changes from Firebase
  db.ref('notes').on('value', (snapshot) => {
    const data = snapshot.val();
    notes = [];

    if (data) {
      // Convert Firebase object to array
      Object.keys(data).forEach(id => {
        notes.push({ id, ...data[id] });
      });
    }

    renderBoard();
    updateStats();
  });
}

// ===== RENDER NOTE DOM ELEMENT =====
function createNoteEl(note) {
  const el = document.createElement('div');
  el.className = `note size-${note.size}`;
  el.dataset.id = note.id;
  el.dataset.type = note.type;

  // Random slight rotation for corkboard feel
  const rot = note.rotation || (Math.random() * 6 - 3);
  note.rotation = rot;
  el.style.cssText = `
    left: ${note.x}px;
    top: ${note.y}px;
    background: ${note.color};
    font-family: '${note.font}', sans-serif;
    --note-rot: ${rot}deg;
    transform: rotate(${rot}deg);
    z-index: ${note.zIndex || 10};
  `;

  // Sticker
  const sticker = document.createElement('div');
  sticker.className = 'note-sticker';
  sticker.textContent = note.emoji || '';
  sticker.style.display = note.emoji ? 'block' : 'none';
  el.appendChild(sticker);

  // Type badge
  const badge = document.createElement('div');
  badge.className = 'note-type-badge';
  badge.textContent = TYPE_LABELS[note.type] || '💌';
  el.appendChild(badge);

  // Note content
  if (note.type === 'photo' || note.photoData) {
    if (note.text) {
      const txt = document.createElement('div');
      txt.className = 'note-text';
      txt.textContent = note.text;
      el.appendChild(txt);
    }
    if (note.photoData) {
      const photoContainer = document.createElement('div');
      photoContainer.className = 'note-photo-container';
      const img = document.createElement('img');
      img.src = note.photoData;
      img.alt = 'Photo';
      photoContainer.appendChild(img);
      el.appendChild(photoContainer);
    }
    if (note.caption) {
      const cap = document.createElement('div');
      cap.className = 'note-caption';
      cap.textContent = note.caption;
      el.appendChild(cap);
    }
  } else {
    const txt = document.createElement('div');
    txt.className = 'note-text';
    txt.textContent = note.text || '';
    el.appendChild(txt);
  }

  // Author
  const author = document.createElement('div');
  author.className = 'note-author';
  author.textContent = `— ${note.author || 'Anonymous'}`;
  el.appendChild(author);

  // Date
  const date = document.createElement('div');
  date.className = 'note-date';
  date.textContent = note.date || '';
  el.appendChild(date);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'note-actions';
  actions.innerHTML = `
    <button class="note-btn edit" title="Edit">✏️</button>
    <button class="note-btn delete" title="Delete">🗑</button>
  `;
  el.appendChild(actions);

  // Action handlers
  actions.querySelector('.edit').addEventListener('click', e => {
    e.stopPropagation();
    openModalForEdit(note.id);
  });
  actions.querySelector('.delete').addEventListener('click', e => {
    e.stopPropagation();
    showDeleteConfirm(note.id);
  });

  // Drag & drop
  makeDraggable(el, note);

  return el;
}

// ===== DRAG & DROP =====
function makeDraggable(el, note) {
  let startX, startY, startLeft, startTop, isDragging = false;

  const onMouseDown = e => {
    if (e.target.closest('.note-actions')) return;
    if (e.button !== 0) return;
    isDragging = false;

    startX = e.clientX;
    startY = e.clientY;
    startLeft = note.x;
    startTop = note.y;

    el.style.zIndex = ++window._maxZ || 100;
    note.zIndex = el.style.zIndex;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = e => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      isDragging = true;
      el.classList.add('dragging');
    }
    if (!isDragging) return;

    const board = $('board');
    const boardRect = board.getBoundingClientRect();

    note.x = Math.max(0, Math.min(startLeft + dx, board.scrollWidth - el.offsetWidth - 10));
    note.y = Math.max(0, Math.min(startTop + dy, board.scrollHeight - el.offsetHeight - 10));

    el.style.left = note.x + 'px';
    el.style.top = note.y + 'px';
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (isDragging) {
      el.classList.remove('dragging');
      isDragging = false;
      // Save position to Firebase
      db.ref('notes/' + note.id).update({ x: note.x, y: note.y, zIndex: note.zIndex });
    }
  };

  // Touch support
  const onTouchStart = e => {
    if (e.target.closest('.note-actions')) return;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startLeft = note.x;
    startTop = note.y;
    isDragging = false;
    el.style.zIndex = ++window._maxZ || 100;
    note.zIndex = el.style.zIndex;
  };

  const onTouchMove = e => {
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (!isDragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      isDragging = true;
      el.classList.add('dragging');
    }
    if (!isDragging) return;
    e.preventDefault();
    const board = $('board');
    note.x = Math.max(0, Math.min(startLeft + dx, board.scrollWidth - el.offsetWidth - 10));
    note.y = Math.max(0, Math.min(startTop + dy, board.scrollHeight - el.offsetHeight - 10));
    el.style.left = note.x + 'px';
    el.style.top = note.y + 'px';
  };

  const onTouchEnd = () => {
    if (isDragging) {
      el.classList.remove('dragging');
      isDragging = false;
      // Save position to Firebase
      db.ref('notes/' + note.id).update({ x: note.x, y: note.y, zIndex: note.zIndex });
    }
  };

  el.addEventListener('mousedown', onMouseDown);
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
}

// ===== RENDER ALL NOTES =====
function renderBoard() { // Renamed from renderNotes to avoid confusion with Firebase listener
  const board = $('board');
  // Remove old note elements
  board.querySelectorAll('.note:not(.note-preview)').forEach(n => n.remove());

  const visible = notes.filter(n => currentFilter === 'all' || n.type === currentFilter);

  $('boardEmpty').style.display = notes.length === 0 ? 'flex' : 'none';

  visible.forEach(note => {
    board.appendChild(createNoteEl(note));
  });

  updateStats();
}

// ===== UPDATE STATS =====
function updateStats() {
  $('countAll').textContent = notes.length;
  $('countMsg').textContent = notes.filter(n => n.type === 'message').length;
  $('countAdv').textContent = notes.filter(n => n.type === 'advice').length;
  $('countMem').textContent = notes.filter(n => n.type === 'memory').length;
  $('countPh').textContent = notes.filter(n => n.type === 'photo').length;
}

// ===== SMART POSITIONING =====
function getSmartPosition() {
  const board = $('board');
  const boardW = board.offsetWidth;

  const margin = 30;
  const noteW = selectedSize === 'small' ? 180 : selectedSize === 'large' ? 300 : 240;
  const noteH = 200;

  // Place notes only in the top visible zone (first ~500px height)
  const zoneHeight = 500;

  // Try random positions in the top zone, avoiding overlap
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = margin + Math.random() * (boardW - noteW - margin * 2);
    const y = margin + Math.random() * (zoneHeight - noteH);

    const overlaps = notes.some(n => {
      const nw = n.size === 'small' ? 180 : n.size === 'large' ? 300 : 240;
      return Math.abs(n.x - x) < nw && Math.abs(n.y - y) < noteH;
    });

    if (!overlaps) return { x, y };
  }

  // Fallback: cascade notes in a grid in the top zone
  const col = notes.length % 4;
  const row = Math.floor(notes.length / 4);
  return {
    x: margin + col * (noteW + 20),
    y: margin + row * (noteH + 20),
  };
}


// ===== MODAL =====
function openModal(note = null) {
  editingId = note ? note.id : null;

  // Reset form
  $('inputAuthor').value = note ? note.author : '';
  $('inputText').value = note ? note.text || '' : '';
  $('inputCaption').value = note ? note.caption || '' : '';
  $('charCount').textContent = (note ? (note.text || '').length : 0);

  selectedColor = note ? note.color : '#fef9c3';
  selectedFont = note ? note.font : 'Inter';
  selectedSize = note ? note.size : 'medium';
  selectedEmoji = note ? note.emoji : '';
  selectedType = note ? note.type : 'message';
  uploadedPhotoDataUrl = note ? note.photoData || null : null;

  // Sync UI
  setActiveType(selectedType);
  syncColorSwatches(selectedColor);
  syncFontBtns(selectedFont);
  syncSizeBtns(selectedSize);
  syncEmojiBtns(selectedEmoji);
  togglePhotoGroup(selectedType);

  // Photo preview
  if (uploadedPhotoDataUrl) {
    $('photoPreviewWrap').style.display = 'block';
    $('photoDropInner').style.display = 'none';
    $('photoPreview').src = uploadedPhotoDataUrl;
  } else {
    $('photoPreviewWrap').style.display = 'none';
    $('photoDropInner').style.display = 'flex';
    $('photoPreview').src = '';
  }

  $('modalTitle').textContent = note ? 'Edit Note ✏️' : 'New Memory 🎓';
  updatePreview();
  $('modalOverlay').classList.add('open');
  $('inputText').focus();
}

function closeModal() {
  $('modalOverlay').classList.remove('open');
  editingId = null;
}

function openModalForEdit(id) {
  const note = notes.find(n => n.id === id);
  if (note) openModal(note);
}

function togglePhotoGroup(type) {
  $('photoGroup').style.display = type === 'photo' ? 'block' : 'none';
  $('textGroup').style.display = type === 'photo' ? 'block' : 'block';
}

// ===== TYPE ===== 
function setActiveType(type) {
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  selectedType = type;
  togglePhotoGroup(type);
  updatePreview();
}

// ===== COLORS =====
function syncColorSwatches(color) {
  document.querySelectorAll('.swatch:not(.swatch-custom)').forEach(s => {
    s.classList.toggle('active', s.dataset.color === color);
  });
  $('customColor').value = color;
}

// ===== FONTS =====
function syncFontBtns(font) {
  document.querySelectorAll('.font-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.font === font);
  });
}

// ===== SIZES =====
function syncSizeBtns(size) {
  document.querySelectorAll('.size-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.size === size);
  });
}

// ===== EMOJIS =====
function syncEmojiBtns(emoji) {
  document.querySelectorAll('.emoji-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.emoji === emoji);
  });
}

// ===== LIVE PREVIEW =====
function updatePreview() {
  const preview = $('notePreview');
  preview.style.background = selectedColor;
  preview.style.fontFamily = `'${selectedFont}', sans-serif`;
  preview.className = `note note-preview size-${selectedSize}`;

  const text = $('inputText').value || 'Your text will appear here...';
  $('previewText').textContent = text;

  const author = $('inputAuthor').value || 'Anonymous';
  $('previewAuthor').textContent = `— ${author}`;

  $('previewBadge').textContent = TYPE_LABELS[selectedType];
  $('previewDate').textContent = formatDate();

  const sticker = $('previewSticker');
  sticker.textContent = selectedEmoji;
  sticker.style.display = selectedEmoji ? 'block' : 'none';

  // Photo preview
  const photoContainer = $('previewPhotoContainer');
  const photoImg = $('previewPhotoImg');
  if (uploadedPhotoDataUrl && selectedType === 'photo') {
    photoContainer.style.display = 'block';
    photoImg.src = uploadedPhotoDataUrl;
  } else {
    photoContainer.style.display = 'none';
  }
}

// ===== SAVE NOTE =====
function saveNote() {
  const text = $('inputText').value.trim();
  const author = $('inputAuthor').value.trim();
  const caption = $('inputCaption').value.trim();

  if (!text && !uploadedPhotoDataUrl) {
    $('inputText').focus();
    $('inputText').style.borderColor = '#ef4444';
    setTimeout(() => ($('inputText').style.borderColor = ''), 1500);
    return;
  }

  const noteData = {
    text,
    author,
    caption,
    color: selectedColor,
    font: selectedFont,
    size: selectedSize,
    emoji: selectedEmoji,
    type: selectedType,
    photoData: uploadedPhotoDataUrl,
    date: formatDate(),
  };

  if (editingId) {
    const noteRef = db.ref('notes/' + editingId);
    noteRef.update(noteData).then(() => {
      closeModal();
    });
  } else {
    const pos = getSmartPosition();
    noteData.x = pos.x;
    noteData.y = pos.y;
    noteData.rotation = Math.random() * 6 - 3;
    noteData.zIndex = ++window._maxZ || 10;
    noteData.timestamp = Date.now(); // Add timestamp for potential sorting

    const newNoteRef = db.ref('notes').push();
    newNoteRef.set(noteData).then(() => {

      // Auto-scroll to top when a new note is added
      window.scrollTo({ top: 0, behavior: 'smooth' });

      closeModal();
    });
  }

  if (!editingId) {
    launchConfetti();
  }
}

// ===== DELETE =====
function showDeleteConfirm(id) {
  pendingDeleteId = id;
  $('confirmOverlay').style.display = 'flex';
}

function confirmDelete() {
  if (pendingDeleteId) {
    db.ref('notes/' + pendingDeleteId).remove().then(() => {
      pendingDeleteId = null;
      $('confirmOverlay').style.display = 'none';
    });
  }
}

function closeConfirm() {
  pendingDeleteId = null;
  $('confirmOverlay').style.display = 'none';
}

// ===== PHOTO UPLOAD =====
function handlePhotoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('File is too large. Maximum size is 5 MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    uploadedPhotoDataUrl = e.target.result;
    $('photoPreview').src = uploadedPhotoDataUrl;
    $('photoPreviewWrap').style.display = 'block';
    $('photoDropInner').style.display = 'none';
    updatePreview();
  };
  reader.readAsDataURL(file);
}

// ===== CONFETTI =====
function launchConfetti() {
  const canvas = $('confetti');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#60a5fa', '#fb923c'];
  const count = 120;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 7 + 3,
      d: Math.random() * count,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 10,
      tiltAngle: 0,
      tiltSpeed: Math.random() * 0.1 + 0.05,
    });
  }

  let frame = 0;
  let angle = 0;
  const maxFrames = 200;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    angle += 0.01;

    particles.forEach(p => {
      p.tiltAngle += p.tiltSpeed;
      p.y += (Math.cos(angle + p.d) + 2.5) * 1.2;
      p.x += Math.sin(angle) * 1.2;
      p.tilt = Math.sin(p.tiltAngle) * 12;

      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();
    });

    frame++;
    if (frame < maxFrames) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  requestAnimationFrame(draw);
}

// ===== PARTICLES BACKGROUND =====
function initParticles() {
  const container = $('particles');
  const items = ['🎓', '⭐', '✨', '💫', '🌟', '🎉'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    const isEmoji = Math.random() > 0.5;
    if (isEmoji) {
      p.textContent = items[Math.floor(Math.random() * items.length)];
      p.style.fontSize = (Math.random() * 16 + 10) + 'px';
      p.style.background = 'transparent';
      p.style.borderRadius = '0';
    } else {
      p.style.width = (Math.random() * 6 + 2) + 'px';
      p.style.height = p.style.width;
      const h = Math.floor(Math.random() * 360);
      p.style.background = `hsla(${h}, 80%, 70%, 0.6)`;
    }
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDuration = (Math.random() * 20 + 12) + 's';
    p.style.animationDelay = (Math.random() * -20) + 's';
    container.appendChild(p);
  }
}

// ===== INIT EVENT LISTENERS =====
function init() {
  loadNotes();
  initParticles();
  window._maxZ = Math.max(10, ...notes.map(n => n.zIndex || 10));

  // Open modal buttons
  $('btnAdd').addEventListener('click', () => openModal());
  $('btnEmptyAdd').addEventListener('click', () => openModal());

  // Close modal
  $('modalClose').addEventListener('click', closeModal);
  $('btnCancel').addEventListener('click', closeModal);
  $('modalOverlay').addEventListener('click', e => {
    if (e.target === $('modalOverlay')) closeModal();
  });

  // Save
  $('btnSave').addEventListener('click', saveNote);

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      $('confirmOverlay').style.display = 'none';
    }
  });

  // Type selector
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveType(btn.dataset.type));
  });

  // Filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderBoard();
    });
  });

  // Color swatches
  document.querySelectorAll('.swatch:not(.swatch-custom)').forEach(s => {
    s.addEventListener('click', () => {
      selectedColor = s.dataset.color;
      syncColorSwatches(selectedColor);
      updatePreview();
    });
  });

  // Custom color
  $('customColor').addEventListener('input', e => {
    selectedColor = e.target.value;
    document.querySelectorAll('.swatch:not(.swatch-custom)').forEach(s => s.classList.remove('active'));
    updatePreview();
  });

  // Fonts
  document.querySelectorAll('.font-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedFont = btn.dataset.font;
      syncFontBtns(selectedFont);
      updatePreview();
    });
  });

  // Sizes
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedSize = btn.dataset.size;
      syncSizeBtns(selectedSize);
      updatePreview();
    });
  });

  // Emoji
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedEmoji = btn.dataset.emoji;
      syncEmojiBtns(selectedEmoji);
      updatePreview();
    });
  });

  // Live preview updates
  $('inputText').addEventListener('input', () => {
    $('charCount').textContent = $('inputText').value.length;
    updatePreview();
  });
  $('inputAuthor').addEventListener('input', updatePreview);

  // Photo upload
  $('photoDrop').addEventListener('click', () => $('photoInput').click());

  $('photoInput').addEventListener('change', e => {
    handlePhotoFile(e.target.files[0]);
  });

  // Drag-over photo area
  $('photoDrop').addEventListener('dragover', e => {
    e.preventDefault();
    $('photoDrop').classList.add('drag-over');
  });

  $('photoDrop').addEventListener('dragleave', () => {
    $('photoDrop').classList.remove('drag-over');
  });

  $('photoDrop').addEventListener('drop', e => {
    e.preventDefault();
    $('photoDrop').classList.remove('drag-over');
    handlePhotoFile(e.dataTransfer.files[0]);
  });

  // Remove photo
  $('photoRemove').addEventListener('click', e => {
    e.stopPropagation();
    uploadedPhotoDataUrl = null;
    $('photoPreview').src = '';
    $('photoPreviewWrap').style.display = 'none';
    $('photoDropInner').style.display = 'flex';
    $('photoInput').value = '';
    updatePreview();
  });

  // Delete confirm
  $('confirmYes').addEventListener('click', confirmDelete);
  $('confirmNo').addEventListener('click', () => {
    $('confirmOverlay').style.display = 'none';
    pendingDeleteId = null;
  });

  // First visit confetti
  if (!localStorage.getItem('gmb_visited')) {
    localStorage.setItem('gmb_visited', '1');
    setTimeout(launchConfetti, 800);
  }
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', init);
