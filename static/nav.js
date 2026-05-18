const navToggle  = document.getElementById('navToggle');
const navLinks   = document.getElementById('navLinks');
const navOverlay = document.getElementById('navOverlay');
function openNav() {
    navLinks.classList.add('active');
    navToggle.classList.add('active');
    navOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeNav() {
    navLinks.classList.remove('active');
    navToggle.classList.remove('active');
    navOverlay.classList.remove('active');
    document.body.style.overflow = '';
}
navToggle.addEventListener('click', () => {
    navLinks.classList.contains('active') ? closeNav() : openNav();
});
navOverlay.addEventListener('click', closeNav);
document.querySelectorAll('.nav-links > a').forEach(link => {
    link.addEventListener('click', closeNav);
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeNav(); closeMore(); }
});
const navMoreBtn      = document.getElementById('navMoreBtn');
const navMoreDropdown = document.getElementById('navMoreDropdown');
function openMore() {
    navMoreDropdown.classList.add('active');
    navMoreBtn.setAttribute('aria-expanded', 'true');
    navMoreBtn.classList.add('active');
}
function closeMore() {
    navMoreDropdown.classList.remove('active');
    navMoreBtn.setAttribute('aria-expanded', 'false');
    navMoreBtn.classList.remove('active');
}
navMoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navMoreDropdown.classList.contains('active') ? closeMore() : openMore();
});
document.addEventListener('click', (e) => {
    if (!e.target.closest('#navMore')) closeMore();
});
navMoreDropdown.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMore);
});