document.addEventListener("DOMContentLoaded", () => {
    const produits = [
        { key: "cartesDeVisite", title: "Cartes de visite", columns: ["recto", "rectoVerso"] },
        { key: "flyersA6", title: "Flyers A6", columns: ["recto", "rectoVerso"] },
        { key: "affichettesA4", title: "Affichettes A4", columns: ["recto", "rectoVerso", "a3"] },
        { key: "affichettesA5", title: "Affichettes A5", columns: ["recto", "rectoVerso"] }
    ];

    produits.forEach(({ key, title, columns }) => {
        const data = JSON.parse(localStorage.getItem(key));
        if (!data) return;

        // Cherche la section correspondant au titre
        const section = Array.from(document.querySelectorAll(".product-section"))
        .find(div => div.querySelector("h2")?.textContent.includes(title));
        if (!section) return;

        const rows = section.querySelectorAll("tbody tr");
        data.forEach((entry, i) => {
        const cells = rows[i]?.querySelectorAll("td");
        if (!cells) return;

        if (columns.includes("recto") && entry.recto)        cells[1].textContent = entry.recto;
        if (columns.includes("rectoVerso") && entry.rectoVerso) cells[2].textContent = entry.rectoVerso;
        if (columns.includes("a3") && entry.a3)              cells[3].textContent = entry.a3;
        });
    });
    });

    const burger = document.querySelector('.burger');
    const navLinks = document.querySelector('.nav-links');

    burger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    });