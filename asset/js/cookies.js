window.addEventListener("DOMContentLoaded", function () {
  if (!document.cookie.includes("cookieConsent=true")) {
    const banner = document.createElement("div");
    banner.id = "cookie-banner";
    banner.innerHTML = `
      <div class="cookie-container">
        <p>Ce site utilise des cookies pour améliorer votre expérience. <a href="cookies.html" style="color: #00bfff; text-decoration: underline;">En savoir plus</a>.</p>
        <button id="accept-cookies">Accepter</button>
      </div>
    `;

    const style = document.createElement("style");
    style.innerHTML = `
      #cookie-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background-color: #1f1f1f;
        color: #fff;
        padding: 1rem;
        z-index: 9999;
        font-family: Arial, sans-serif;
        box-shadow: 0 -2px 10px rgba(0,0,0,0.4);
      }

      .cookie-container {
        max-width: 960px;
        margin: 0 auto;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
      }

      .cookie-container p {
        margin: 0;
        flex: 1 1 auto;
      }

      #accept-cookies {
        background-color: #00b894;
        border: none;
        color: white;
        padding: 0.6rem 1.2rem;
        font-size: 1rem;
        cursor: pointer;
        border-radius: 6px;
        transition: background 0.3s ease;
      }

      #accept-cookies:hover {
        background-color: #019875;
      }

      @media (max-width: 600px) {
        .cookie-container {
          flex-direction: column;
          align-items: flex-start;
        }

        #accept-cookies {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById("accept-cookies").addEventListener("click", function () {
      document.cookie = "cookieConsent=true; path=/; expires=Fri, 31 Dec 2099 23:59:59 GMT";
      banner.remove();
    });
  }
});
