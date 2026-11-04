/* ============================================
   INVITACIÓN DE BODA — EMILCE & GUSTAVO
   Interacción, Animación y Música Nativa
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  const envelopeScene  = document.getElementById('envelope-scene');
  const invitation     = document.getElementById('invitation');
  const openBtn        = document.getElementById('open-btn');
  const envelopePhoto  = document.getElementById('envelope-photo');
  const envelopeCanvas = document.getElementById('envelope-canvas');
  const knotTrigger    = document.getElementById('knot-trigger');
  const openLabel      = document.getElementById('open-label');
  const musicToggle    = document.getElementById('music-toggle');
  const weddingAudio   = document.getElementById('wedding-audio');
  const guestGate      = document.getElementById('guest-gate');
  const guestLookupForm = document.getElementById('guest-lookup-form');
  const guestLookupName = document.getElementById('guest-lookup-name');
  const guestLookupButton = document.getElementById('guest-lookup-button');
  const guestLookupFeedback = document.getElementById('guest-lookup-feedback');
  const guestLookupRetry = document.getElementById('guest-lookup-retry');
  const guestLookupView = document.getElementById('guest-lookup-view');
  const guestWelcomeView = document.getElementById('guest-welcome-view');
  const guestWelcomeTitle = document.getElementById('guest-welcome-title');
  const guestWelcomeCapacity = document.getElementById('guest-welcome-capacity');
  const guestWelcomePeopleLabel = document.getElementById('guest-welcome-people-label');
  const guestContinueButton = document.getElementById('guest-continue-button');
  const rsvpGuestSummary = document.getElementById('rsvp-guest-summary');
  const rsvpPeople = document.getElementById('rsvpPeople');
  const rsvpPeopleHint = document.getElementById('rsvp-people-hint');
  let identifiedGuestName = '';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Lock scroll during envelope presentation
  document.body.classList.add('envelope-active');

  function showGuestLookupFeedback(message, showRetry = false) {
    guestLookupFeedback.textContent = message;
    guestLookupRetry.hidden = !showRetry;
  }

  function displayGuest(guest, isHost = false) {
    const capacity = isHost ? null : Number(guest.cantidadInvitada);
    identifiedGuestName = guest.nombreCompleto;
    guestGate.setAttribute('aria-labelledby', 'guest-welcome-title');
    guestLookupView.hidden = true;
    guestWelcomeView.hidden = false;
    guestWelcomeTitle.textContent = `¡Te damos la bienvenida, ${guest.nombreCompleto}!`;
    const capacityMessage = guestWelcomeCapacity.parentElement;
    capacityMessage.hidden = isHost;
    rsvpGuestSummary.hidden = isHost;

    if (!isHost) {
      guestWelcomeCapacity.textContent = String(capacity);
      guestWelcomePeopleLabel.textContent = capacity === 1 ? 'persona' : 'personas';
      rsvpGuestSummary.textContent = `Tu invitación contempla hasta ${capacity} ${capacity === 1 ? 'persona' : 'personas'}.`;
      rsvpPeople.max = String(capacity);
      rsvpPeople.value = '1';
      rsvpPeopleHint.textContent = `Incluite en el total. El máximo es ${capacity} ${capacity === 1 ? 'persona' : 'personas'}.`;
    }
  }

  if (guestLookupForm) {
    guestLookupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      guestLookupButton.disabled = true;
      guestLookupRetry.hidden = true;
      showGuestLookupFeedback('');

      try {
        const result = await submitPublicForm('/api/public/guest/identify', {
          nombreCompleto: guestLookupName.value.trim()
        });
        displayGuest(result.guest, result.host === true);
      } catch (error) {
        const message = error.code === 'not_found'
          ? 'No encontramos una invitación con ese nombre. Revisá que hayas escrito correctamente tu nombre y apellido.'
          : error.code === 'ambiguous'
            ? 'Encontramos más de una invitación con ese nombre. Probá otra forma de escribir tu nombre y apellido.'
            : error.message;
        showGuestLookupFeedback(message, true);
      } finally {
        guestLookupButton.disabled = false;
      }
    });

    guestLookupRetry.addEventListener('click', () => {
      showGuestLookupFeedback('');
      guestLookupName.focus();
    });

    guestContinueButton.addEventListener('click', () => {
      guestGate.hidden = true;
      envelopeScene.hidden = false;
      if (knotTrigger) knotTrigger.focus();
      else if (openBtn) openBtn.focus();
    });

  }

  const ctx = envelopeCanvas ? envelopeCanvas.getContext('2d') : null;

  // ============================================
  // GESTIÓN DE AUDIO (HTML5 NATIVO)
  // ============================================
  let isMusicPlaying = false;
  let hasStartedOnce = false;
  const START_TIME_SECONDS = 13; // Empezar en 0:13

  function playWeddingMusic() {
    if (!weddingAudio) return;

    if (!hasStartedOnce) {
      weddingAudio.currentTime = START_TIME_SECONDS;
      hasStartedOnce = true;
    }

    const promise = weddingAudio.play();
    if (promise !== undefined) {
      promise.then(() => {
        isMusicPlaying = true;
        updateMusicUI(true);
      }).catch((err) => {
        console.warn('Autoplay bloqueado o esperando interacción:', err);
        isMusicPlaying = false;
        updateMusicUI(false);
      });
    }
  }

  function pauseWeddingMusic() {
    if (!weddingAudio) return;
    weddingAudio.pause();
    isMusicPlaying = false;
    updateMusicUI(false);
  }

  function toggleWeddingMusic() {
    if (isMusicPlaying) {
      pauseWeddingMusic();
    } else {
      playWeddingMusic();
    }
  }

  function updateMusicUI(playing) {
    if (!musicToggle) return;
    if (playing) {
      musicToggle.classList.add('is-playing');
      musicToggle.setAttribute('aria-label', 'Pausar música');
    } else {
      musicToggle.classList.remove('is-playing');
      musicToggle.setAttribute('aria-label', 'Reproducir música');
    }
  }

  // Listener para el botón en la esquina de la foto
  if (musicToggle) {
    musicToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleWeddingMusic();
    });
  }

  // Si el audio termina, volver al segundo 13 para un loop perfecto
  if (weddingAudio) {
    weddingAudio.addEventListener('ended', () => {
      weddingAudio.currentTime = START_TIME_SECONDS;
      weddingAudio.play().catch(() => {});
    });
  }


  // ============================================
  // PRELOAD 35 REALISTIC FABRIC UNTYING FRAMES
  // ============================================
  const TOTAL_FRAMES = 35;
  const frames = [];
  let currentFrame = 0;
  let isAnimating = false;
  let isUntied = false;

  function drawFrame(index) {
    if (!ctx || !frames[index] || !frames[index].complete) return;
    ctx.clearRect(0, 0, envelopeCanvas.width, envelopeCanvas.height);
    ctx.drawImage(frames[index], 0, 0, envelopeCanvas.width, envelopeCanvas.height);
  }

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const img = new Image();
    const frameNum = String(i).padStart(2, '0');
    img.onload = () => {
      // Render initial frame 0 immediately as soon as ready
      if (i === 0 && currentFrame === 0 && !isAnimating) {
        drawFrame(0);
      }
    };
    img.src = `assets/frames/frame_${frameNum}.jpg`;
    if (img.complete && i === 0 && currentFrame === 0 && !isAnimating) {
      drawFrame(0);
    }
    frames.push(img);
  }

  // Double check draw frame 0 when window loads
  window.addEventListener('load', () => {
    if (currentFrame === 0 && !isAnimating) {
      drawFrame(0);
    }
  });

  // ============================================
  // SMOOTH CINEMATIC UNTYING ANIMATION
  // ============================================

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function getUntyingFrame(progress) {
    const releaseStart = 0.08;
    const knotReleaseEnd = 0.68;
    const knotFrame = 20;

    if (progress <= releaseStart) return 0;
    if (progress < knotReleaseEnd) {
      const releaseProgress = (progress - releaseStart) / (knotReleaseEnd - releaseStart);
      return Math.round(easeOutCubic(releaseProgress) * knotFrame);
    }

    const tailProgress = (progress - knotReleaseEnd) / (1 - knotReleaseEnd);
    return Math.min(TOTAL_FRAMES - 1, knotFrame + Math.round(easeOutCubic(tailProgress) * (TOTAL_FRAMES - 1 - knotFrame)));
  }

  function startUntyingAnimation() {
    if (isAnimating || isUntied) return;
    isAnimating = true;

    // Iniciar la música de inmediato con la interacción del usuario
    playWeddingMusic();

    // Fade out helper button & hint
    if (openLabel) {
      openLabel.classList.add('fade-out');
    }
    if (knotTrigger) {
      knotTrigger.style.pointerEvents = 'none';
    }

    if (prefersReducedMotion) {
      isAnimating = false;
      isUntied = true;
      revealInvitation();
      return;
    }

    const DURATION = 2300; // 2.3s de desatado realista de satén (fotogramas de alta fidelidad)
    const startTime = performance.now();

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / DURATION, 1);
      currentFrame = getUntyingFrame(progress);
      drawFrame(currentFrame);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Moño desatado por completo: pasar a la apertura física del sobre
        isAnimating = false;
        isUntied = true;
        drawFrame(TOTAL_FRAMES - 1);
        startPhysicalEnvelopeOpening();
      }
    }

    requestAnimationFrame(animate);
  }

  // ============================================
  // APERTURA FÍSICA DEL SOBRE EN 3D
  // ============================================
  const ribbonSlide = document.getElementById('envelope-ribbon-slide');

  function startPhysicalEnvelopeOpening() {
    // 1. Mostrar la cinta desatada y ocultar el canvas suavemente
    if (ribbonSlide) {
      ribbonSlide.style.opacity = '1';
    }
    if (envelopeCanvas) {
      envelopeCanvas.style.opacity = '0';
    }

    // 2. La cinta se desliza de forma orgánica y cae hacia afuera del sobre
    setTimeout(() => {
      if (ribbonSlide) {
        ribbonSlide.classList.add('is-sliding');
      }
    }, 120);

    // 3. Con la cinta apartándose, las puertas laterales se abren hacia los costados en 3D
    setTimeout(() => {
      if (envelopePhoto) {
        envelopePhoto.classList.add('doors-open');
      }
    }, 420);

    // 4. El sobre con sus puertas abiertas y la foto de los novios en el centro da paso a la invitación
    setTimeout(() => {
      revealInvitation();
    }, 1950);
  }

  let isRevealing = false;

  function revealInvitation() {
    if (isRevealing || !envelopePhoto || envelopeScene.classList.contains('hidden')) return;
    isRevealing = true;

    // Asegurar que la música esté sonando si el navegador la había demorado
    if (!isMusicPlaying) {
      playWeddingMusic();
    }

    // Desbloquear el scroll del body
    document.body.classList.remove('envelope-active');

    // Zoom cinematográfico continuo: la foto del sobre se agranda suavemente
    // hacia la pantalla mientras la tarjeta de la invitación se expande a su encuentro
    envelopePhoto.classList.add('zoom-into-card');
    invitation.classList.add('visible');

    const hideEnvelope = () => {
      envelopeScene.classList.add('hidden');
      if (prefersReducedMotion) {
        envelopeScene.style.display = 'none';
        return;
      }

      setTimeout(() => {
        envelopeScene.style.display = 'none';
      }, 900);
    };

    if (prefersReducedMotion) {
      hideEnvelope();
    } else {
      setTimeout(hideEnvelope, 650);
    }
  }

  // Direct touch / click on the center knot of the bow
  if (knotTrigger) {
    knotTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      startUntyingAnimation();
    });
  }

  // Click on "Abrir Invitación" button
  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      startUntyingAnimation();
    });
  }

  // Click on envelope: inicia la secuencia completa sin interrupciones accidentales
  if (envelopePhoto) {
    envelopePhoto.addEventListener('click', () => {
      if (!isUntied && !isAnimating) {
        startUntyingAnimation();
      }
    });
  }

  // ============================================
  // EDITORIAL SCROLL OBSERVER
  // ============================================

  if ('IntersectionObserver' in window && !prefersReducedMotion) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -50px 0px', threshold: 0.1 });

  document.querySelectorAll('.section-reveal').forEach((el) => {
    revealObserver.observe(el);
  });
  } else {
  document.querySelectorAll('.section-reveal').forEach((el) => {
    el.classList.add('in-view');
  });
  }

  // ============================================
  // COPY BANK DATA BUTTON
  // ============================================
  const copyBankBtn = document.getElementById('copyBankBtn');
  if (copyBankBtn) {
    copyBankBtn.addEventListener('click', async () => {
      const alias = document.getElementById('aliasValue')?.textContent || '';
      const cbu = document.getElementById('cbuValue')?.textContent || '';
      const text = `ALIAS: ${alias}\nCBU: ${cbu}`;
      const copyText = document.getElementById('copyBankText');

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const temporaryInput = document.createElement('textarea');
          temporaryInput.value = text;
          temporaryInput.setAttribute('readonly', '');
          temporaryInput.style.position = 'fixed';
          temporaryInput.style.opacity = '0';
          document.body.appendChild(temporaryInput);
          temporaryInput.select();
          let copied = false;
          try {
            copied = document.execCommand('copy');
          } finally {
            temporaryInput.remove();
          }

          if (!copied) {
            throw new Error('El navegador no permitió copiar los datos.');
          }
        }

        if (copyText) copyText.textContent = '¡COPIADO! ✓';
        copyBankBtn.classList.add('copied');
      } catch (error) {
        console.error('No se pudieron copiar los datos bancarios:', error);
        if (copyText) copyText.textContent = 'No se pudo copiar. Intentá nuevamente.';
        copyBankBtn.classList.add('copy-failed');
      }

      setTimeout(() => {
        if (copyText) copyText.textContent = 'COPIAR DATOS BANCARIOS';
        copyBankBtn.classList.remove('copied', 'copy-failed');
      }, 3000);
    });
  }

  // ============================================
  // PLAYLIST DE LA BODA (SUGERIR CANCIÓN)
  // ============================================
  const playlistForm = document.getElementById('playlistForm');
  const playlistSong = document.getElementById('playlistSong');
  const playlistArtist = document.getElementById('playlistArtist');
  const playlistFeedback = document.getElementById('playlistFeedback');
  const playlistSubmissionKey = document.getElementById('playlistSubmissionKey');
  const rsvpForm = document.getElementById('rsvpForm');
  const rsvpAttendance = document.getElementById('rsvpAttendance');
  const rsvpPeopleField = document.getElementById('rsvpPeopleField');
  const rsvpFeedback = document.getElementById('rsvpFeedback');
  const rsvpSubmissionKey = document.getElementById('rsvpSubmissionKey');
  const btnSuggestSong = document.getElementById('btnSuggestSong');
  const rsvpSubmitBtn = document.getElementById('rsvpSubmitBtn');

  function newSubmissionKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function submitPublicForm(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || 'No se pudo enviar el formulario.');
      error.code = result.code;
      throw error;
    }
    return result;
  }

  function showFormFeedback(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', isError);
    element.classList.add('show');
  }

  function optionalFormValue(id) {
    return document.getElementById(id)?.value.trim() || '';
  }

  if (playlistForm) {
    playlistSubmissionKey.value = newSubmissionKey();
    playlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      btnSuggestSong.disabled = true;
      try {
        await submitPublicForm('/api/public/songs', {
          submissionKey: playlistSubmissionKey.value,
          cancion: playlistSong.value.trim(),
          artista: playlistArtist.value.trim(),
          nombreInvitado: identifiedGuestName,
          comentario: optionalFormValue('playlistComment')
        });
        showFormFeedback(playlistFeedback, '¡Gracias! Tu canción ya llegó a los novios.');
        playlistForm.reset();
        playlistSubmissionKey.value = newSubmissionKey();
      } catch (error) {
        console.error('No se pudo guardar la recomendación musical:', error);
        showFormFeedback(playlistFeedback, error.message, true);
      } finally {
        btnSuggestSong.disabled = false;
      }
    });
  }

  if (rsvpForm) {
    rsvpSubmissionKey.value = newSubmissionKey();
    rsvpAttendance.addEventListener('change', () => {
      const attending = rsvpAttendance.value === 'Confirmado';
      rsvpPeopleField.hidden = !attending;
      rsvpPeople.required = attending;
      if (!attending) rsvpPeople.value = '0';
      else if (Number(rsvpPeople.value) < 1) rsvpPeople.value = '1';
    });

    rsvpForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      rsvpSubmitBtn.disabled = true;
      try {
        const result = await submitPublicForm('/api/public/rsvp', {
          submissionKey: rsvpSubmissionKey.value,
          asistencia: rsvpAttendance.value,
          cantidadPersonas: rsvpAttendance.value === 'Confirmado' ? Number(rsvpPeople.value) : 0,
          acompanantes: optionalFormValue('rsvpCompanions'),
          telefono: optionalFormValue('rsvpPhone'),
          mensaje: optionalFormValue('rsvpMessage')
        });
        showFormFeedback(rsvpFeedback, result.duplicate
          ? 'Tu respuesta ya estaba registrada.'
          : '¡Gracias! Tu respuesta quedó registrada.');
        rsvpForm.reset();
        rsvpPeopleField.hidden = true;
        rsvpPeople.required = false;
        rsvpSubmissionKey.value = newSubmissionKey();
      } catch (error) {
        console.error('No se pudo guardar la confirmación de asistencia:', error);
        showFormFeedback(rsvpFeedback, error.message, true);
      } finally {
        rsvpSubmitBtn.disabled = false;
      }
    });
  }

  // ============================================
  // COUNTDOWN TIMER
  // ============================================
  const weddingDate = new Date('2026-12-04T11:00:00-03:00');

  function updateCountdown() {
    const now = new Date();
    const diff = weddingDate - now;

    if (diff <= 0) {
      document.getElementById('cd-d').textContent = '00';
      document.getElementById('cd-h').textContent = '00';
      document.getElementById('cd-m').textContent = '00';
      document.getElementById('cd-s').textContent = '00';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('cd-d').textContent = String(days).padStart(2, '0');
    document.getElementById('cd-h').textContent = String(hours).padStart(2, '0');
    document.getElementById('cd-m').textContent = String(minutes).padStart(2, '0');
    document.getElementById('cd-s').textContent = String(seconds).padStart(2, '0');
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

});
