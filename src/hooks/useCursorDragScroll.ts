import { useEffect } from 'react';

/**
 * Universal Cursor Drag-To-Scroll Hook
 * Enables intuitive, butter-smooth click-and-drag scrolling with mouse cursor
 * across all pages, tables, tab bars, galleries, and overflow containers.
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
        // Skip explicitly non-scrollable containers
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

      // Check document / window scrolling
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

    const onMouseDown = (e: MouseEvent) => {
      // Only handle primary left click or middle click
      if (e.button !== 0 && e.button !== 1) return;

      const target = e.target as HTMLElement;
      if (isInteractiveElement(target)) return;

      // Stop any running momentum animation
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
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown || !targetContainer) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const distance = Math.hypot(dx, dy);

      // 4px threshold before engaging drag-scroll to preserve precise clicks
      if (!isDragging && distance > 4) {
        isDragging = true;
        document.body.classList.add('is-cursor-scrolling');
      }

      if (isDragging) {
        e.preventDefault();

        // Calculate instantaneous velocity for smooth momentum flick
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

    const applyMomentum = () => {
      if (!targetContainer) return;
      const friction = 0.94;
      velocityX *= friction;
      velocityY *= friction;

      if (Math.abs(velocityX) > 0.3 || Math.abs(velocityY) > 0.3) {
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

    const onMouseUp = () => {
      if (!isDown) return;
      isDown = false;

      if (isDragging) {
        document.body.classList.remove('is-cursor-scrolling');
        // Trigger momentum scroll
        momentumRafId = requestAnimationFrame(applyMomentum);
      }

      // Reset state on next tick to prevent drag release from triggering unwanted click
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

    // Attach listeners to window for whole website coverage
    window.addEventListener('mousedown', onMouseDown, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp, { passive: true });
    window.addEventListener('click', onClickCapture, { capture: true });

    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('click', onClickCapture, { capture: true });
      if (momentumRafId) cancelAnimationFrame(momentumRafId);
      document.body.classList.remove('is-cursor-scrolling');
    };
  }, []);
}
