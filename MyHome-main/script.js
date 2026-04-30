document.addEventListener('DOMContentLoaded', () => {
    // 1. Custom Cursor
    const cursor = document.getElementById('cursor');
    const outline = document.getElementById('cursor-outline');
    
    document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
        
        outline.animate({
            left: `${e.clientX}px`,
            top: `${e.clientY}px`
        }, { duration: 500, fill: "forwards" });
    });

    // 2. Scroll Progress Bar
    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        document.getElementById('progress-bar').style.width = scrolled + '%';
    });

    // 3. Smooth Scrolling
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // 4. Reveal Animations on Scroll
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.glass-card, .glow-img-wrap, .section-title, .solving-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(50px)';
        el.style.transition = 'all 1s cubic-bezier(0.23, 1, 0.32, 1)';
        observer.observe(el);
    });

    // 5. Fancy Resume Button
    const resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            alert('이력서(PDF) 다운로드를 시작합니다 (프리미엄 포트폴리오 준비 중).');
        });
    }

    // 6. Interactive Hover for Cards
    document.querySelectorAll('.glass-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // 7. Back To Top (Integrated Fancy Style)
    const btt = document.createElement('div');
    btt.innerHTML = 'TOP';
    btt.style.cssText = `
        position: fixed;
        bottom: 40px;
        right: 40px;
        width: 60px;
        height: 60px;
        background: var(--accent-color);
        color: var(--primary-color);
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: 'Syncopate', sans-serif;
        font-size: 0.6rem;
        font-weight: 800;
        cursor: pointer;
        opacity: 0;
        transition: all 0.5s ease;
        z-index: 999;
        box-shadow: 0 0 20px var(--border-glow);
    `;
    document.body.appendChild(btt);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 800) {
            btt.style.opacity = '1';
            btt.style.transform = 'scale(1)';
        } else {
            btt.style.opacity = '0';
            btt.style.transform = 'scale(0)';
        }
    });

    btt.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 8. Contact Form (Mailto)
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('contact-name').value;
            const phone = document.getElementById('contact-phone').value;
            const message = document.getElementById('contact-message').value;

            const subject = encodeURIComponent(`${name} 님의 포트폴리오 사이트 문의`);
            const body = encodeURIComponent(`이름: ${name}\n전화번호: ${phone}\n\n문의 내용:\n${message}`);
            
            // mailto 링크 생성 및 실행
            window.location.href = `mailto:pjs42427571@gmail.com?subject=${subject}&body=${body}`;
            
            alert('기본 이메일 앱이 열립니다. 이메일을 전송해 주세요!');
        });
    }

    // 9. Free Board (Firebase Realtime Database)
    const firebaseConfig = {
      databaseURL: "https://junseopark-ef73f-default-rtdb.firebaseio.com",
      projectId: "junseopark-ef73f",
    };
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.database();
    const boardRef = db.ref('posts');

    const boardSubmitBtn = document.getElementById('board-submit-btn');
    const boardList = document.getElementById('board-list');

    // Realtime listeners
    boardRef.on('value', (snapshot) => {
        if(!boardList) return;
        boardList.innerHTML = '';
        const data = snapshot.val();
        if (!data) return;

        // Convert object to array and sort by date descending
        const posts = Object.keys(data).map(key => ({ id: key, ...data[key] }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        posts.forEach((post) => {
            const item = document.createElement('div');
            item.className = 'glass-card';
            item.style.padding = '2rem';
            item.style.borderLeft = '4px solid var(--accent-color)';
            
            let repliesHtml = '';
            const repliesArray = post.replies ? Object.values(post.replies) : [];
            repliesArray.forEach(reply => {
                repliesHtml += `
                    <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem; font-size: 0.9rem;">
                        <div style="color: var(--accent-color); font-weight: 600; margin-bottom: 0.3rem;">✅ 답변 (Reply)</div>
                        <div style="white-space: pre-wrap; color: var(--text-white);">${reply}</div>
                    </div>
                `;
            });

            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; font-size: 0.9rem; color: var(--text-gray); border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 1rem;">
                    <div>
                        <span style="color: var(--text-white); font-weight: 600;">${post.name}</span>
                        <span style="margin-left: 10px;">${post.email}</span>
                    </div>
                    <div>
                        ${new Date(post.date).toLocaleString()}
                        <button onclick="editPost('${post.id}')" style="background:transparent; border:none; color:var(--text-gray); margin-left:10px; cursor:pointer; font-size:0.9rem;" title="수정(관리자)">✏️</button>
                        <button onclick="deletePost('${post.id}')" style="background:transparent; border:none; color:var(--text-gray); margin-left:5px; cursor:pointer; font-size:0.9rem;" title="삭제(관리자)">🗑️</button>
                    </div>
                </div>
                <div style="margin-bottom: 1.5rem; white-space: pre-wrap; color: var(--text-white); font-size: 1.05rem;">${post.content}</div>
                
                <div style="margin-bottom: 1rem;">
                    <button onclick="likePost('${post.id}', ${post.likes || 0})" style="background: rgba(0, 229, 255, 0.1); border: 1px solid var(--accent-color); color: var(--accent-color); padding: 0.4rem 1rem; border-radius: 4px; cursor: pointer; transition: 0.3s; font-weight: 600;">
                        👍 추천 <span style="margin-left: 5px;">${post.likes || 0}</span>
                    </button>
                </div>

                <div style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 1rem; margin-top: 1rem;">
                    <div style="margin-bottom: 1rem;">${repliesHtml}</div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <textarea id="reply-input-${post.id}" class="glass-textarea" placeholder="이 내용에 답변 달기..." style="flex: 1; height: 50px; padding: 0.5rem; min-width: 200px;"></textarea>
                        <button onclick="addReply('${post.id}')" class="btn-glow" style="padding: 0.5rem 1.5rem; font-size: 0.8rem;">답변 등록</button>
                    </div>
                </div>
            `;
            boardList.appendChild(item);
        });
    });

    // Add post
    if (boardSubmitBtn) {
        boardSubmitBtn.addEventListener('click', () => {
            const name = document.getElementById('board-name').value;
            const email = document.getElementById('board-email').value;
            const content = document.getElementById('board-content').value;

            if(!name || !email || !content) {
                alert('이름, 이메일, 그리고 내용을 모두 입력해 주세요.');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                alert('유효한 이메일 형식(@ 포함)을 입력해 주세요.');
                return;
            }

            const newPost = {
                name, email, content, 
                date: new Date().toISOString(),
                likes: 0
            };

            boardRef.push(newPost);

            document.getElementById('board-name').value = '';
            document.getElementById('board-email').value = '';
            document.getElementById('board-content').value = '';
        });
    }

    // Global function for adding reply
    window.addReply = function(id) {
        const input = document.getElementById(`reply-input-${id}`);
        const replyContent = input.value;
        if(!replyContent) {
            alert('답변 내용을 입력해 주세요.');
            return;
        }
        db.ref(`posts/${id}/replies`).push(replyContent);
    };

    // Like Post
    window.likePost = function(id, currentLikes) {
        db.ref(`posts/${id}`).update({ likes: currentLikes + 1 });
    };

    window.deletePost = function(id) {
        const pwd = prompt('게시물을 삭제하려면 관리자 비밀번호를 입력하세요:');
        if(pwd !== 'ejrgusdlahThf') {
            if(pwd !== null) alert('비밀번호가 일치하지 않습니다.');
            return;
        }
        if(confirm('정말 이 게시물을 삭제하시겠습니까?')) {
            db.ref(`posts/${id}`).remove();
        }
    };

    window.editPost = function(id) {
        const pwd = prompt('게시물을 수정하려면 관리자 비밀번호를 입력하세요:');
        if(pwd !== 'ejrgusdlahThf') {
            if(pwd !== null) alert('비밀번호가 일치하지 않습니다.');
            return;
        }
        
        db.ref(`posts/${id}/content`).once('value').then(snapshot => {
            const currentContent = snapshot.val();
            const newContent = prompt('수정할 내용을 입력하세요:', currentContent);
            if(newContent !== null && newContent.trim() !== '') {
                db.ref(`posts/${id}`).update({ content: newContent });
            }
        });
    };

});
