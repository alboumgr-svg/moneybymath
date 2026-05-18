document.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;

    const particles = [];
    const count = 15;
    const gravity = 0.5;
    const friction = 0.7;
    const bounce = 0.6;

    let forceDrop = false; 

    // Trigger instant drop on scroll
    function handleScroll() {
        forceDrop = true;
    }
    window.addEventListener('scroll', handleScroll, { passive: true });

    const platforms = Array.from(document.querySelectorAll('.btn'));

    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'money-particle';
        el.textContent = '$';
        document.body.appendChild(el);

        const particle = {
            el: el,
            x: e.clientX,
            y: e.clientY,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20 - 10,
            width: 20,
            height: 20,
            dead: false
        };
        particles.push(particle);
    }

    function update() {
        particles.forEach(p => {
            if (p.dead) return;

            // 🔥 FORCE DROP MODE
            if (forceDrop) {
                p.vx = 0;
                p.vy = 25; // fast downward slam
            } else {
                p.vy += gravity;
            }

            p.x += p.vx;
            p.y += p.vy;

            // Disable bouncing when force dropping
            if (!forceDrop) {
                platforms.forEach(plat => {
                    const rect = plat.getBoundingClientRect();
                    if (p.x > rect.left && p.x < rect.right && 
                        p.y + p.height > rect.top && p.y < rect.bottom && p.vy > 0) {
                        
                        p.y = rect.top - p.height;
                        p.vy *= -bounce; 
                        p.vx *= friction;

                        if (Math.abs(p.vy) < 2) p.vy = 0;
                    }
                });
            }

            // Kill when off screen
            if (p.y > window.innerHeight) p.dead = true;
            if (p.x < 0 || p.x > window.innerWidth) p.vx *= -1;

            p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        });

        if (particles.some(p => !p.dead)) {
            requestAnimationFrame(update);
        } else {
            // 🔥 CLEANUP LISTENER
            window.removeEventListener('scroll', handleScroll);
            particles.forEach(p => p.el.remove());
        }
    }

    requestAnimationFrame(update);
});