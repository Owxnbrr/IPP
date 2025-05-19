// carrousel
        let slideIndex = 1;
        showSlides(slideIndex);
        
        function prevSlide() {
            showSlides(slideIndex -= 1);
        }
        
        function nextSlide() {
            showSlides(slideIndex += 1);
        }
        
        function currentSlide(n) {
            showSlides(slideIndex = n);
        }
        
        function showSlides(n) {
            let i;
            let slides = document.getElementsByClassName("carousel-slide");
            let indicators = document.getElementsByClassName("indicator");
            
            if (n > slides.length) {slideIndex = 1}
            if (n < 1) {slideIndex = slides.length}
            
            for (i = 0; i < slides.length; i++) {
                slides[i].classList.remove("active");
            }
            
            for (i = 0; i < indicators.length; i++) {
                indicators[i].classList.remove("active");
            }
            
            slides[slideIndex-1].classList.add("active");
            indicators[slideIndex-1].classList.add("active");
        }
        
        // Auto slide every 10 seconds
        setInterval(function() {
            nextSlide();
        }, 10000);

        document.addEventListener('DOMContentLoaded', function() {
            const reviewCards = document.querySelectorAll('.review-card');
            const prevButton = document.querySelector('.prev-button');
            const nextButton = document.querySelector('.next-button');
            let currentIndex = 0;

            function updateCarousel() {
                reviewCards.forEach((card, index) => {
                    card.classList.remove('active', 'prev', 'next');
                    
                    if (index === currentIndex) {
                        card.classList.add('active');
                    } else if (index === getPrevIndex()) {
                        card.classList.add('prev');
                    } else if (index === getNextIndex()) {
                        card.classList.add('next');
                    }
                    
                    // Force DOM reflow to ensure transitions work properly
                    void card.offsetWidth;
                });
            }

            function getNextIndex() {
                return (currentIndex + 1) % reviewCards.length;
            }

            function getPrevIndex() {
                return (currentIndex - 1 + reviewCards.length) % reviewCards.length;
            }

            function goToNextSlide() {
                currentIndex = getNextIndex();
                updateCarousel();
            }

            function goToPrevSlide() {
                currentIndex = getPrevIndex();
                updateCarousel();
            }

            prevButton.addEventListener('click', goToPrevSlide);
            nextButton.addEventListener('click', goToNextSlide);

            // Initialize the carousel
            updateCarousel();

            // Auto-play functionality
            let autoplayInterval = setInterval(goToNextSlide, 5000);

            // Pause autoplay when hovering over the carousel
            const carouselContainer = document.querySelector('.carousel-container');
            carouselContainer.addEventListener('mouseenter', () => {
                clearInterval(autoplayInterval);
            });

            carouselContainer.addEventListener('mouseleave', () => {
                autoplayInterval = setInterval(goToNextSlide, 5000);
            });
        });
        function openLightbox(img) {
        const lightbox = document.getElementById("lightbox");
        const lightboxImg = document.getElementById("lightbox-img");
        lightboxImg.src = img.src;
        lightbox.style.display = "flex";
        document.body.classList.add("noscroll");
        }

        function closeLightbox(event) {
        const lightboxImg = document.getElementById("lightbox-img");
        if (!lightboxImg.contains(event.target)) {
            document.getElementById("lightbox").style.display = "none";
            document.body.classList.remove("noscroll");
        }
        }

        // Scroll auto vers un élément au chargement
        window.addEventListener('load', () => {
        const hash = window.location.hash;
        if (hash) {
            const target = document.querySelector(hash);
            if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
            }
        }
        });


    const imageIds = ["IMG_carrousel_1", "IMG_carrousel_2", "IMG_carrousel_3"];
    imageIds.forEach(id => {
        const savedImage = localStorage.getItem(id);
        if (savedImage) {
        const img = document.getElementById(id);
        if (img) {
            img.src = savedImage;
        }
        }
    });

    window.addEventListener("DOMContentLoaded", () => {
    const cards = JSON.parse(localStorage.getItem("cards") || "[]");
    const container = document.getElementById("customInsertZone");

    cards.forEach(card => {
        const points = card.points.map(p => `<li>${p}</li>`).join("");
        const html = `
        <div class="service-card1">
            <img src="${card.image}" alt="${card.title}" class="service-image1" onclick="openLightbox(this)">
            <div class="service-content1">
                <h3 class="service-title1">${card.title}</h3>
                <p class="service-description1">${card.description}</p>
                <ul class="service-benefits1">${points}</ul>
                <div class="service-footer1">
                <a href="tarifs.html#devis" class="cta-btn">Demander un devis</a>
                </div>
            </div>
        </div>
        `;
        container.innerHTML += html;
    });
    });

    const burger = document.querySelector('.burger');
    const navLinks = document.querySelector('.nav-links');

    burger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    });

    function updateCarousel(index) {
    const cards = document.querySelectorAll('.review-card');

    // Ne fais rien si on est sur mobile
    if (window.innerWidth <= 768) return;

    cards.forEach((card, i) => {
        card.classList.remove('active', 'prev', 'next');

        if (i === index) {
            card.classList.add('active');
        } else if (i === index - 1) {
            card.classList.add('prev');
        } else if (i === index + 1) {
            card.classList.add('next');
        }
    });
}

    // Exemple d'appel (à adapter selon ton système de navigation)
    let currentIndex = 0;
    document.querySelector('#next-button').addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % document.querySelectorAll('.review-card').length;
        updateCarousel(currentIndex);
    });
 