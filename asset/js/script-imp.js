const burger = document.querySelector('.burger');
    const navLinks = document.querySelector('.nav-links');

    burger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    });

    const progressBar = document.querySelector('.timeline-progress');
    const timeline = document.querySelector('.timeline');

    window.addEventListener('scroll', () => {
    const timeline = document.querySelector('.timeline');
    const progressBar = document.querySelector('.timeline-progress');

    const rect = timeline.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    const totalScrollable = windowHeight + timeline.offsetHeight;
    const visiblePart = windowHeight - rect.top;

    const progress = Math.max(0, Math.min(visiblePart / totalScrollable, 1));
    progressBar.style.height = `${progress * 100}%`;
    });
    