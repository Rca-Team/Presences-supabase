import { useEffect } from 'react';

/**
 * Smart Adaptive Cursor & Device Scroll Engine
 * - Desktop/Mouse: Smooth click-and-drag pan scrolling with momentum flick and horizontal wheel translation.
 * - Mobile/Touch: 100% native compositor-thread hardware-accelerated touch physics with zero listeners or input latency.
 */
export function useCursorDragScroll() {
  useEffect(() => {
    let isDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollStartX = 0;
    let scrollStartY = 0;
    let targetContainer: HTMLElement | 'window' | null = null;
    let velocityX = 0;
    let velocityY = 0;
    let lastTime = 0;
    let lastX = 0;
    let lastY = 0;
    let momentumRafId: number | null = null;

    const findScrollableContainer = (target: HTMLElement | null): HTMLElement | 'window' | null => {
      let curr = target;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        if (curr.classList.contains('no-cursor-scroll') || curr.classList.contains('no-drag-scroll')) {
          return null;
        }

        const style = window.getComputedStyle(curr);
        const overflowX = style.overflowX;
        const overflowY = style.overflowY;

        const isScrollableX = (overflowX === 'auto' || overflowX === 'scroll') && curr.scrollWidth > curr.clientWidth + 2;
        const isScrollableY = (overflowY === 'auto' || overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight + 2;

        if (isScrollableX || isScrollableY) {
          return curr;
        }
        curr = curr.parentElement;
      }

      // Check window / body scrollability
      const isDocScrollable =
        document.documentElement.scrollHeight > window.innerHeight + 10 ||
        document.body.scrollHeight > window.innerHeight + 10 ||
        document.documentElement.scrollWidth > window.innerWidth + 10;

      if (isDocScrollable) {
        return 'window';
      }
      return null;
    };

    const isInteractiveElement = (target: HTMLElement | null): boolean => {
      if (!target) return false;
      const interactiveTags = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME'];
      let curr: HTMLElement | null = target;
      while (curr && curr !== document.body) {
        if (interactiveTags.includes(curr.tagName)) return true;
        if (curr.getAttribute('role') === 'button' || curr.getAttribute('role') === 'combobox') return true;
        if (curr.getAttribute('contenteditable') === 'true') return true;
        if (curr.classList.contains('no-drag-scroll') || curr.classList.contains('no-cursor-scroll')) return true;
        curr = curr.parentElement;
      }
      return false;
    };

    // 1. Pointer Down (Only mouse & stylus desktop interactions)
    const onPointerDown = (e: PointerEvent) => {
      // 100% Bypass touch pointers so mobile devices have pure native touch scrolling
      if (e.pointerType === 'touch') return;

      // Only left click or middle click
      if (e.button !== 0 && e.button !== 1) return;

      const target = e.target as HTMLElement;
      if (isInteractiveElement(target)) return;

      if (momentumRafId) {
        cancelAnimationFrame(momentumRafId);
        momentumRafId = null;
      }

      const container = findScrollableContainer(target);
      if (!container) return;

      isDown = true;
      isDragging = false;
      targetContainer = container;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = performance.now();
      velocityX = 0;
      velocityY = 0;

      if (container === 'window') {
        scrollStartX = window.scrollX;
        scrollStartY = window.scrollY;
      } else {
        scrollStartX = container.scrollLeft;
        scrollStartY = container.scrollTop;
      }

      // Dynamically attach move & up listeners ONLY while mouse is actively pressed down
      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp, { passive: true });
      window.addEventListener('pointercancel', onPointerUp, { passive: true });
    };

    // 2. Pointer Move (Active during mouse drag only)
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !isDown || !targetContainer) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const distance = Math.hypot(dx, dy);

      // 4px threshold before engaging drag-scroll to keep standard clicks precise
      if (!isDragging && distance > 4) {
        isDragging = true;
        document.body.classList.add('is-cursor-scrolling');
      }

      if (isDragging) {
        e.preventDefault();

        const now = performance.now();
        const dt = Math.max(1, now - lastTime);
        velocityX = ((e.clientX - lastX) / dt) * 16;
        velocityY = ((e.clientY - lastY) / dt) * 16;
        lastX = e.clientX;
        lastY = e.clientY;
        lastTime = now;

        if (targetContainer === 'window') {
          window.scrollTo({
            left: scrollStartX - dx,
            top: scrollStartY - dy,
            behavior: 'instant' as ScrollBehavior,
          });
        } else {
          targetContainer.scrollLeft = scrollStartX - dx;
          targetContainer.scrollTop = scrollStartY - dy;
        }
      }
    };

    // 3. Momentum Decay Animation
    const applyMomentum = () => {
      if (!targetContainer) return;
      const friction = 0.94;
      velocityX *= friction;
      velocityY *= friction;

      if (Math.abs(velocityX) > 0.25 || Math.abs(velocityY) > 0.25) {
        if (targetContainer === 'window') {
          window.scrollBy({
            left: -velocityX,
            top: -velocityY,
            behavior: 'instant' as ScrollBehavior,
          });
        } else {
          targetContainer.scrollLeft -= velocityX;
          targetContainer.scrollTop -= velocityY;
        }
        momentumRafId = requestAnimationFrame(applyMomentum);
      } else {
        momentumRafId = null;
      }
    };

    // 4. Pointer Up / Cancel
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      isDown = false;

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (isDragging) {
        document.body.classList.remove('is-cursor-scrolling');
        momentumRafId = requestAnimationFrame(applyMomentum);
      }

      setTimeout(() => {
        isDragging = false;
        targetContainer = null;
      }, 50);
    };

    const onClickCapture = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // 5. Desktop Horizontal Wheel Helper
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= 0 || Math.abs(e.deltaX) > 0) return;

      let el = e.target as HTMLElement | null;
      while (el && el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const isHoriz = (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2;
        const isVert = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 5;

        if (isHoriz && !isVert) {
          el.scrollLeft += e.deltaY;
          e.preventDefault();
          return;
        }
        el = el.parentElement;
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('click', onClickCapture, { capture: true });
    window.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('click', onClickCapture, { capture: true });
      window.removeEventListener('wheel', onWheel);
      if (momentumRafId) cancelAnimationFrame(momentumRafId);
      document.body.classList.remove('is-cursor-scrolling');
    };
  }, []);
}

