const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');
menuToggle?.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});
document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    mainNav?.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

const filterButtons = document.querySelectorAll('.filter-buttons button');
const courseCards = document.querySelectorAll('.course-card');
const courseSearch = document.querySelector('#courseSearch');
const emptyMessage = document.querySelector('#emptyMessage');
let currentFilter = 'all';
function filterCourses() {
  const keyword = (courseSearch?.value || '').trim().toLowerCase();
  let visibleCount = 0;
  courseCards.forEach((card) => {
    const tags = card.dataset.tags || '';
    const title = (card.dataset.title || '').toLowerCase();
    const text = card.textContent.toLowerCase();
    const matchesFilter = currentFilter === 'all' || tags.includes(currentFilter);
    const matchesSearch = !keyword || title.includes(keyword) || text.includes(keyword);
    const shouldShow = matchesFilter && matchesSearch;
    card.hidden = !shouldShow;
    if (shouldShow) visibleCount += 1;
  });
  if (emptyMessage) emptyMessage.hidden = visibleCount !== 0;
}
filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    currentFilter = button.dataset.filter || 'all';
    filterCourses();
  });
});
courseSearch?.addEventListener('input', filterCourses);

const categoryTabs = document.querySelectorAll('.category-tabs button');
const categoryPanels = document.querySelectorAll('.category-panel');
categoryTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const category = tab.dataset.category;
    categoryTabs.forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    categoryPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === category);
    });
  });
});
