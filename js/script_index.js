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
        // Variables globales pour la gestion du lightbox
        let currentServiceId = '';
        let currentLightboxIndex = 0;
        
        // Fonctions pour naviguer entre les images dans la carte
        function showImage(container, index) {
            const images = container.querySelectorAll('.service-image1');
            const dots = container.querySelectorAll('.image-dot');
            
            // Désactiver toutes les images et points
            images.forEach(img => img.classList.remove('active'));
            dots.forEach(dot => dot.classList.remove('active'));
            
            // Activer l'image et le point sélectionnés
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
            
            // Trouver l'index actuel
            images.forEach((img, i) => {
                if (img.classList.contains('active')) {
                    currentIndex = i;
                }
            });
            
            // Calculer le nouvel index
            const nextIndex = (currentIndex + 1) % images.length;
            showImage(container, nextIndex);
        }
        
        function prevImage(arrowElement) {
            event.stopPropagation();
            const container = arrowElement.closest('.service-image-container');
            const images = container.querySelectorAll('.service-image1');
            let currentIndex = 0;
            
            // Trouver l'index actuel
            images.forEach((img, i) => {
                if (img.classList.contains('active')) {
                    currentIndex = i;
                }
            });
            
            // Calculer le nouvel index
            const prevIndex = (currentIndex - 1 + images.length) % images.length;
            showImage(container, prevIndex);
        }
        
        // Ajouter des événements de clic aux images pour ouvrir la lightbox
        document.querySelectorAll('.service-image-container').forEach(container => {
            container.addEventListener('click', function(e) {
                // Ne pas ouvrir la lightbox si on a cliqué sur une flèche ou un point
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
        
        // Fonction pour ouvrir la lightbox
        function openLightbox(serviceId, imageIndex) {
            const lightbox = document.getElementById("lightbox");
            const lightboxImg = document.getElementById("lightbox-img");
            const serviceCard = document.querySelector(`.service-card1[data-id="${serviceId}"]`);
            const images = serviceCard.querySelectorAll('.service-image1');
            
            // Sauvegarder les informations actuelles
            currentServiceId = serviceId;
            currentLightboxIndex = imageIndex;
            
            // Définir l'image
            lightboxImg.src = images[imageIndex].src;
            lightboxImg.alt = images[imageIndex].alt;
            
            // Mettre à jour le compteur
            updateLightboxCounter(imageIndex, images.length);
            
            // Générer les points de navigation
            generateLightboxDots(images.length, imageIndex);
            
            // Afficher la lightbox
            lightbox.style.display = "flex";
            // document.body.classList.add("noscroll");
        }
        
        // Fonction pour fermer la lightbox
        function closeLightbox(event) {
            const lightboxContent = document.querySelector('.service-image-container');
            if (!lightboxContent.contains(event.target) || event.target.id === 'lightbox') {
                document.getElementById("lightbox").style.display = "none";
                document.body.classList.remove("noscroll");
            }
        }
        
        // Navigation dans la lightbox
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
            
            // Mettre à jour l'image
            lightboxImg.src = images[currentLightboxIndex].src;
            lightboxImg.alt = images[currentLightboxIndex].alt;
            
            // Mettre à jour le compteur
            updateLightboxCounter(currentLightboxIndex, images.length);
            
            // Mettre à jour les points de navigation
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

    window.addEventListener("scroll", function () {
        const header = document.querySelector(".header-container");
        if (window.scrollY > 50) {
            header.classList.add("shrink");
        } else {
            header.classList.remove("shrink");
        }
    });

