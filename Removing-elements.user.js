// ==UserScript==
// @name         הסרת אלמנטים מיותרים מאתר המכירה לקהילה שלך
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  מסיר הודעות עם fade-out, מוסיף כפתור לקפיצה למעלה. שואל בכל טעינה. תמונות יוסרו רק אם בתוך .ui-widget או לפני #cattab.
// @match        https://www.sales.org.il/sale.aspx*
// @icon         https://www.sales.org.il/images/nlogo.jpg
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // --- CSS לאנימציה, לחצן ולפאנל אישור ---
    GM_addStyle(`
        .fade-out {
            opacity: 1;
            transition: opacity 0.5s ease;
        }
        .fade-out.removing {
            opacity: 0;
        }

        #scrollToTopBtn {
            position: fixed;
            bottom: 20px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 20px;
            cursor: pointer;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }
        #scrollToTopBtn.visible {
            opacity: 1;
            pointer-events: auto;
        }
        #scrollToTopBtn:hover {
            background-color: #0056b3;
        }

        /* פאנל אישור קטן */
        #tmConfirmPanel {
            position: fixed;
            z-index: 10000;
            background: #fff;
            border: 1px solid #ccc;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            right: 12px;
            bottom: 80px;
            max-width: 320px;
            font-family: sans-serif;
            direction: rtl;
            text-align: right;
        }
        #tmConfirmPanel p { margin: 0 0 8px 0; font-size: 13px; }
        #tmConfirmPanel .tm-btn { display: inline-block; float: right; margin-left: 4px; margin-right: 4px; padding: 6px 10px; font-size: 13px; border-radius: 4px; cursor: pointer; }
        #tmConfirmPanel .tm-confirm { background: #28a745; color: white; border: none; }
        #tmConfirmPanel .tm-cancel { background: #dc3545; color: white; border: none; }

        /* כפתור להרצה מאוחרת (קבוע על המסך) */
        #tmRunLaterBtn {
            position: fixed;
            z-index: 10000;
            right: 12px;
            top: 20px;
            background: #ffb100;
            color: #111;
            padding: 8px 10px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            font-size: 13px;
            direction: rtl;
        }

        /* הודעת סטטוס קצרה */
        #tmStatusMsg {
            position: fixed;
            z-index: 10001;
            right: 12px;
            bottom: 140px;
            background: rgba(0,0,0,0.85);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            display: none;
            direction: rtl;
        }
    `);

    // --- פונקציית fade-remove (מוחקת בצורה חלקה) ---
    function fadeRemove(el) {
        if (!el) return;
        if (!el.classList.contains('fade-out')) el.classList.add('fade-out');
        requestAnimationFrame(() => {
            el.classList.add('removing');
        });
        setTimeout(() => {
            try { el.remove(); } catch (e) {}
        }, 500);
    }

    // --- עזרה: האם אימג' נמצא לפני #cattab בדום? ---
    function isBeforeCattabInDOM(img) {
        try {
            const cattab = document.getElementById('cattab');
            if (!cattab) return false;
            // אם img הוא לפני cattab בדום, אז compareDocumentPosition עם Cattab יחזיר DOCUMENT_POSITION_FOLLOWING
            return !!(img.compareDocumentPosition(cattab) & Node.DOCUMENT_POSITION_FOLLOWING);
        } catch (e) {
            return false;
        }
    }

    // --- מבצעים ספציפיים להסרה (לא ירוצו בלי אישור) ---
    function performRemoval() {
        let removedCount = 0;

        // 1) מחיקת הודעות לפי הסלקטור המקורי (הסרה של האלמנט)
        document.querySelectorAll('.ui-state-highlight.ui-corner-all, #messages p.message, #messages p.error')
            .forEach(el => { fadeRemove(el); removedCount++; });

        // 2) הסרת תמונות שממוקמות ישירות בתוך .ui-widget (.ui-widget > img) ---
        document.querySelectorAll('.ui-widget > img').forEach(img => {
            try {
                fadeRemove(img);
                removedCount++;
            } catch (e) { /* התעלמות משגיאות */ }
        });

        // 3) הסרת המחלקה ui-widget מכל האלמנטים שמחזיקים אותה (לא מוחק את האלמנט)
        const withUiWidget = document.querySelectorAll('.ui-widget');
        withUiWidget.forEach(el => {
            el.classList.remove('ui-widget');
            removedCount++;
        });

        if (removedCount === 0) {
            showStatus('לא נמצא מה להחליף');
        } else {
            showStatus(`הוסר בהצלחה ${removedCount} אלמנטים!`);
        }
    }

    // --- הצגת הודעה זמנית למשתמש ---
    function showStatus(text, timeout = 3500) {
        let s = document.getElementById('tmStatusMsg');
        if (!s) {
            s = document.createElement('div');
            s.id = 'tmStatusMsg';
            document.body.appendChild(s);
        }
        s.innerHTML = text;
        s.style.display = 'block';
        clearTimeout(s._tmTimeout);
        s._tmTimeout = setTimeout(() => { s.style.display = 'none'; }, timeout);
    }

    // --- פאנל אישור שמופיע בהתחלה (מזמין את המשתמש לאשר הסרה) ---
    function createConfirmPanel() {
        if (document.getElementById('tmConfirmPanel')) return;

        const panel = document.createElement('div');
        panel.id = 'tmConfirmPanel';
        panel.innerHTML = `
            <p>להסיר פריטים לא רלוונטים?<br>(הודעות וכדו')</p>
            <div style="text-align:left;">
                <button class="tm-btn tm-confirm">הסר עכשיו</button>
                <button class="tm-btn tm-cancel">לא כרגע</button>
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('.tm-confirm').addEventListener('click', () => {
            performRemoval();
            confirmedRemoval = true;
            panel.remove();
        });

        panel.querySelector('.tm-cancel').addEventListener('click', () => {
            panel.remove();
            showStatus('לא יוסר כלום!<br><br>לחץ על הכפתור הצהוב<br>להפעלה חוזרת<br>[מופיע למעלה]');
        });

    }

    // --- כפתור להרצה מאוחרת / פתיחת הפאנל ---
    function createRunLaterButton() {
        if (document.getElementById('tmRunLaterBtn')) return;
        const btn = document.createElement('button');
        btn.id = 'tmRunLaterBtn';
        btn.textContent = 'הסר אלמנטים לא רלוונטיים';
        document.body.appendChild(btn);

        btn.addEventListener('click', () => {
            createConfirmPanel();
        });
    }

    // --- בקשה לאישור בכל טעינה (אין שמירה ב-sessionStorage) ---
    let confirmedRemoval = false;
    window.addEventListener('load', () => {
        createConfirmPanel();
        createRunLaterButton();
    });

    // --- מעקב אחרי טעינות דינמיות ---
    const observer = new MutationObserver(mutations => {
        if (!confirmedRemoval) return;
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (!(node instanceof Element)) return;

                // הודעות ספציפיות שנוספו — אם יש
                if (node.matches && (node.matches('.ui-state-highlight.ui-corner-all') ||
                                     node.matches('#messages p.message') ||
                                     node.matches('#messages p.error'))) {
                    fadeRemove(node);
                }

                // הסרת class ui-widget עבור אלמנטים שנוספו (לא מוחק את האלמנט)
                if (node.querySelectorAll) {
                    node.querySelectorAll('.ui-widget').forEach(el => el.classList.remove('ui-widget'));
                }

                // אם ה-node הוא IMG ישיר בתצורה .ui-widget > img
                if (node.matches && node.matches('.ui-widget > img')) {
                    try { fadeRemove(node); } catch(e) {}
                }

                // אם ה-node מכיל תמונות מסוג .ui-widget > img בתוכו
                if (node.querySelectorAll) {
                    node.querySelectorAll('.ui-widget > img').forEach(img => {
                        try { fadeRemove(img); } catch(e) {}
                    });
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // --- יצירת כפתור ScrollToTop ---
    const scrollBtn = document.createElement('button');
    scrollBtn.id = 'scrollToTopBtn';
    scrollBtn.innerHTML = '↑';
    document.body.appendChild(scrollBtn);

    function positionButton() {
        const mainDiv = document.querySelector('#headercontent');
        if (mainDiv) {
            const rect = mainDiv.getBoundingClientRect();
            const offsetRight = window.innerWidth - rect.right;
            scrollBtn.style.right = (offsetRight + 10) + 'px';
        } else {
            scrollBtn.style.right = '20px';
        }
    }

    positionButton();
    window.addEventListener('resize', positionButton);

    let isDragging = false;
    let offsetX, offsetY;

    scrollBtn.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - scrollBtn.getBoundingClientRect().left;
        offsetY = e.clientY - scrollBtn.getBoundingClientRect().top;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            scrollBtn.style.top = (e.clientY - offsetY) + 'px';
            scrollBtn.style.left = (e.clientX - offsetX) + 'px';
            scrollBtn.style.bottom = 'auto';
            scrollBtn.style.right = 'auto';
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    window.addEventListener('scroll', () => {
        if (window.scrollY > 200) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    });

    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

})();
