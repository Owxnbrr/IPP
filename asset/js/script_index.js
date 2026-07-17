        let slideIndex = 1;
        let carouselAutoplayTimer = null;
        let carouselInitialized = false;

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

            if (!slides.length) return;

            if (n > slides.length) {slideIndex = 1}
            if (n < 1) {slideIndex = slides.length}

            for (i = 0; i < slides.length; i++) {
                slides[i].classList.remove("active");
            }

            for (i = 0; i < indicators.length; i++) {
                indicators[i].classList.remove("active");
            }

            slides[slideIndex-1].classList.add("active");
            if (indicators[slideIndex-1]) {
                indicators[slideIndex-1].classList.add("active");
            }
        }

        // Initialisation du carrousel, appelée par public-carousel.js une fois
        // les slides définitives rendues (Appwrite ou fallback statique).
        // Idempotente : ré-appelable sans empiler les setInterval.
        function initCarousel() {
            carouselInitialized = true;

            const slides = document.getElementsByClassName("carousel-slide");
            const nav = document.querySelector(".carousel-nav");
            const indicators = document.querySelector(".carousel-indicators");

            if (carouselAutoplayTimer) {
                clearInterval(carouselAutoplayTimer);
                carouselAutoplayTimer = null;
            }

            const several = slides.length > 1;
            if (nav) nav.style.display = several ? "" : "none";
            if (indicators) indicators.style.display = several ? "" : "none";

            if (!slides.length) return;

            slideIndex = 1;
            showSlides(slideIndex);

            // Autoplay uniquement s'il y a plusieurs slides.
            if (several) {
                carouselAutoplayTimer = setInterval(nextSlide, 10000);
            }
        }
        window.initCarousel = initCarousel;

        // Filet de sécurité : si le module public-carousel.js ne s'exécute pas
        // (CDN bloqué, très vieux navigateur), le carrousel statique démarre seul.
        setTimeout(function () {
            if (!carouselInitialized) initCarousel();
        }, 3000);

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

            updateCarousel();

            let autoplayInterval = setInterval(goToNextSlide, 5000);

            const carouselContainer = document.querySelector('.carousel-container');
            carouselContainer.addEventListener('mouseenter', () => {
                clearInterval(autoplayInterval);
            });

            carouselContainer.addEventListener('mouseleave', () => {
                autoplayInterval = setInterval(goToNextSlide, 5000);
            });
        });
        let currentServiceId = '';
        let currentLightboxIndex = 0;
        
        function showImage(container, index) {
            const images = container.querySelectorAll('.service-image1');
            const dots = container.querySelectorAll('.image-dot');
            
            images.forEach(img => img.classList.remove('active'));
            dots.forEach(dot => dot.classList.remove('active'));
            
            if (images[index]) {
                images[index].classList.add('active');
                dots[index].classList.add('active');
            }
        }
        
        function nextImage(arrowElement) {
            event.stopPropagation();
            const container = arrowElement.closest('.service-image-container');
            const images = container.querySelectorAll('.service-image1');
            let currentIndex = 0;
            
            images.forEach((img, i) => {
                if (img.classList.contains('active')) {
                    currentIndex = i;
                }
            });
            
            const nextIndex = (currentIndex + 1) % images.length;
            showImage(container, nextIndex);
        }
        
        function prevImage(arrowElement) {
            event.stopPropagation();
            const container = arrowElement.closest('.service-image-container');
            const images = container.querySelectorAll('.service-image1');
            let currentIndex = 0;
            
            images.forEach((img, i) => {
                if (img.classList.contains('active')) {
                    currentIndex = i;
                }
            });
            
            const prevIndex = (currentIndex - 1 + images.length) % images.length;
            showImage(container, prevIndex);
        }
        
        document.querySelectorAll('.service-image-container').forEach(container => {
            container.addEventListener('click', function(e) {
                if (e.target.closest('.image-arrow') || e.target.closest('.image-dot')) {
                    return;
                }
                
                const serviceCard = this.closest('.service-card1');
                const serviceId = serviceCard.getAttribute('data-id');
                const activeImage = this.querySelector('.service-image1.active');
                const activeIndex = parseInt(activeImage.getAttribute('data-index'));
                
                openLightbox(serviceId, activeIndex);
            });
        });
        
        function openLightbox(serviceId, imageIndex) {
            const lightbox = document.getElementById("lightbox");
            const lightboxImg = document.getElementById("lightbox-img");
            const serviceCard = document.querySelector(`.service-card1[data-id="${serviceId}"]`);
            const images = serviceCard.querySelectorAll('.service-image1');
            
            currentServiceId = serviceId;
            currentLightboxIndex = imageIndex;
            
            lightboxImg.src = images[imageIndex].src;
            lightboxImg.alt = images[imageIndex].alt;
            
            updateLightboxCounter(imageIndex, images.length);
            
            generateLightboxDots(images.length, imageIndex);
            
            lightbox.style.display = "flex";
        }
        
        function closeLightbox(event) {
            const lightboxContent = document.querySelector('.service-image-container');
            if (!lightboxContent.contains(event.target) || event.target.id === 'lightbox') {
                document.getElementById("lightbox").style.display = "none";
                document.body.classList.remove("noscroll");
            }
        }
        
        function lightboxNext(event) {
            event.stopPropagation();
            const serviceCard = document.querySelector(`.service-card1[data-id="${currentServiceId}"]`);
            const images = serviceCard.querySelectorAll('.service-image1');
            
            currentLightboxIndex = (currentLightboxIndex + 1) % images.length;
            updateLightbox(images);
        }
        
        function lightboxPrev(event) {
            event.stopPropagation();
            const serviceCard = document.querySelector(`.service-card1[data-id="${currentServiceId}"]`);
            const images = serviceCard.querySelectorAll('.service-image1');
            
            currentLightboxIndex = (currentLightboxIndex - 1 + images.length) % images.length;
            updateLightbox(images);
        }
        
        function updateLightbox(images) {
            const lightboxImg = document.getElementById("lightbox-img");
            
            lightboxImg.src = images[currentLightboxIndex].src;
            lightboxImg.alt = images[currentLightboxIndex].alt;
            
            updateLightboxCounter(currentLightboxIndex, images.length);
            
            updateLightboxDots();
        }
        
        function updateLightboxCounter(index, total) {
            const counter = document.querySelector('.lightbox-counter');
            counter.textContent = `${index + 1} / ${total}`;
        }
        
        function generateLightboxDots(total, activeIndex) {
            const nav = document.querySelector('.lightbox-nav');
            nav.innerHTML = '';
            
            for (let i = 0; i < total; i++) {
                const dot = document.createElement('div');
                dot.className = 'lightbox-dot' + (i === activeIndex ? ' active' : '');
                dot.onclick = function(event) {
                    event.stopPropagation();
                    currentLightboxIndex = i;
                    const serviceCard = document.querySelector(`.service-card1[data-id="${currentServiceId}"]`);
                    const images = serviceCard.querySelectorAll('.service-image1');
                    updateLightbox(images);
                };
                nav.appendChild(dot);
            }
        }
        
        function updateLightboxDots() {
            const dots = document.querySelectorAll('.lightbox-nav .lightbox-dot');
            dots.forEach((dot, i) => {
                if (i === currentLightboxIndex) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        }
        
        window.addEventListener('load', () => {
            const hash = window.location.hash;
            if (hash) {
                const target = document.querySelector(hash);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });


    // (Supprimé : l'ancien remplacement des images du carrousel depuis
    // localStorage, hérité du vieil admin. Il aurait écrasé les images
    // Appwrite chez les navigateurs ayant utilisé l'ancienne page admin.)

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

    window.addEventListener("scroll", function () {
        const header = document.querySelector(".header-container");
        if (window.scrollY > 50) {
            header.classList.add("shrink");
        } else {
            header.classList.remove("shrink");
        }
    });

