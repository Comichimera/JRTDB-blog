function togglePost(id) {
    const content = document.getElementById(id);
    if (!content) return;

    const card = content.closest('.post-card');
    const isOpen = card.classList.toggle('active');

    card.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    content.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
}

function handleKey(evt, id) {
    const key = evt.key;
    if (key === 'Enter' || key === ' ') {
        evt.preventDefault();
        togglePost(id);
    }
}
