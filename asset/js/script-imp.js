const burger = document.querySelector('.burger');
    const navLinks = document.querySelector('.nav-links');

    burger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    });

    const progressBar = document.querySelector('.timeline-progress');
    const timeline = document.querySelector('.timeline');

    window.addEventListener('scroll', () => {
        const timelineTop = timeline.offsetTop;
        const timelineHeight = timeline.offsetHeight;
        const scrollY = window.scrollY + window.innerHeight;

        // Calcul du pourcentage de scroll dans la timeline
        const distance = scrollY - timelineTop;
        const progress = Math.min(distance / timelineHeight, 1);

        progressBar.style.height = `${progress * 100}%`;
    });