document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('game-container');

    // Elementos da Interface DOM
    const overlay = document.getElementById('overlay');
    const startBtn = document.getElementById('start-btn');
    const gameTitle = document.getElementById('game-title');
    const currentScoreDOM = document.getElementById('current-score');
    const bestScoreDOM = document.getElementById('best-score');
    const currentLevelDOM = document.getElementById('current-level');
    const shieldStatusDOM = document.getElementById('shield-status');
    const flashEffect = document.getElementById('flash-effect');
    const levelAlert = document.getElementById('level-alert');
    const laserChargeBar = document.getElementById('laser-charge-bar');
    const laserReadyText = document.getElementById('laser-ready-text');

    canvas.width = 400;
    canvas.height = 600;

    let gameEngine;
    let score = 0;
    let level = 1;
    let hasShield = false;
    let bestScore = localStorage.getItem('cyberbird-best') || 0;
    if (bestScoreDOM) bestScoreDOM.textContent = bestScore;
    let gameActive = false;

    // Gerenciador do Laser
    let laserCharge = 0;         
    let laserActiveTimer = 0;    

    // Instanciação segura da API de Som do Navegador
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playSound(freq, type, duration, endFreq = null) {
        if (!audioCtx) return;
        try {
            let osc = audioCtx.createOscillator();
            let gainNode = audioCtx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            if (endFreq) {
                osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
            }
            
            gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch(e) {}
    }

    // Física e Atributos do Jogador
    const bird = {
        x: 80,
        y: 300,
        radius: 10,
        velocity: 0,
        gravity: 0.38,
        jump: -7.2,
        trail: []
    };

    let pipes = [];
    let particles = [];
    let items = [];

    // Mecânica de Progressão Adaptativa e Vãos Variáveis
    const pipeConfig = {
        width: 60,
        baseGap: 180,       
        currentGap: 180,    
        minGap: 125,        
        baseSpeed: 3,
        currentSpeed: 3,
        spawnRate: 100, 
        timer: 0,
        verticalSpeed: 0    
    };

    // ==========================================
    // SISTEMA DE CENÁRIO (PARALLAX PROCEDURAL)
    // ==========================================
    const background = {
        stars: [],
        buildingsFar: [],
        buildingsNear: [],
        groundOffset: 0,
        
        init() {
            this.stars = Array.from({ length: 40 }, () => ({
                x: Math.random() * canvas.width,
                y: Math.random() * (canvas.height - 200),
                size: Math.random() * 2,
                alpha: Math.random()
            }));

            this.buildingsFar = Array.from({ length: 8 }, (_, i) => ({
                x: i * 60,
                width: 50 + Math.random() * 30,
                height: 150 + Math.random() * 100,
                color: '#13132b'
            }));

            this.buildingsNear = Array.from({ length: 6 }, (_, i) => ({
                x: i * 90,
                width: 60 + Math.random() * 40,
                height: 220 + Math.random() * 120,
                color: '#1c1c3a',
                windows: Array.from({ length: 15 }, () => ({
                    wx: Math.random(), wy: Math.random(),
                    wColor: Math.random() > 0.5 ? '#00f2fe' : '#ff007f'
                }))
            }));
        },

        updateAndDraw() {
            let skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
            skyGrad.addColorStop(0, '#04040c');
            skyGrad.addColorStop(0.7, '#0f0f26');
            skyGrad.addColorStop(1, '#1b112c');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            this.stars.forEach(s => {
                s.alpha += (Math.random() - 0.5) * 0.05;
                s.alpha = Math.max(0.2, Math.min(1, s.alpha));
                ctx.fillStyle = `rgba(0, 242, 254, ${s.alpha})`;
                ctx.fillRect(s.x, s.y, s.size, s.size);
            });

            this.buildingsFar.forEach(b => {
                if (gameActive) b.x -= (pipeConfig.currentSpeed * 0.1);
                if (b.x + b.width < 0) b.x = canvas.width;
                ctx.fillStyle = b.color;
                ctx.fillRect(b.x, canvas.height - b.height, b.width, b.height);
            });

            this.buildingsNear.forEach(b => {
                if (gameActive) b.x -= (pipeConfig.currentSpeed * 0.25);
                if (b.x + b.width < 0) b.x = canvas.width;
                
                ctx.fillStyle = b.color;
                ctx.fillRect(b.x, canvas.height - b.height, b.width, b.height);

                b.windows.forEach(w => {
                    let winX = b.x + (w.wx * (b.width - 10)) + 5;
                    let winY = (canvas.height - b.height) + (w.wy * (b.height - 40)) + 10;
                    if (winX > b.x && winX < b.x + b.width - 5) {
                        ctx.fillStyle = Math.random() > 0.99 ? '#05050f' : w.wColor;
                        ctx.fillRect(winX, winY, 3, 5);
                    }
                });
            });

            if (gameActive) this.groundOffset = (this.groundOffset - pipeConfig.currentSpeed) % 20;
            
            ctx.strokeStyle = 'rgba(255, 0, 127, 0.4)';
            ctx.lineWidth = 2;
            let groundY = canvas.height - 30;
            
            ctx.fillStyle = '#0a0518';
            ctx.fillRect(0, groundY, canvas.width, 30);
            
            ctx.beginPath();
            ctx.moveTo(0, groundY);
            ctx.lineTo(canvas.width, groundY);
            ctx.stroke();

            for (let x = this.groundOffset; x < canvas.width; x += 20) {
                ctx.beginPath();
                ctx.moveTo(x, groundY);
                ctx.lineTo(x - 10, canvas.height);
                ctx.stroke();
            }
        }
    };

    background.init();

    // ==========================================
    // CAPTURA DE INPUTS
    // ==========================================
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') eventJump();
        if (e.code === 'KeyX') eventFireLaser();
    });
    
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) eventJump();
        if (e.button === 2) {
            e.preventDefault();
            eventFireLaser();
        }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('touchstart', (e) => { 
        e.preventDefault(); 
        eventJump(); 
    }, { passive: false });

    if (startBtn) {
        startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            initAudio();
            resetGame();
        });
    }

    function eventJump() {
        if (!gameActive) return;
        bird.velocity = bird.jump;
        playSound(400, 'square', 0.1, 700);
        
        for(let i=0; i<6; i++) {
            particles.push(new Particle(bird.x - 5, bird.y, '#00f2fe'));
        }
    }

    function eventFireLaser() {
        if (!gameActive || laserCharge < 100) return;
        
        laserCharge = 0;
        laserActiveTimer = 15;
        if(laserReadyText) laserReadyText.classList.remove('ready-pulse');

        playSound(900, 'sawtooth', 0.4, 80);

        if (flashEffect) {
            flashEffect.classList.remove('flash-active');
            void flashEffect.offsetWidth;
            flashEffect.classList.add('flash-active');
        }
        if (container) {
            container.classList.add('shake');
            setTimeout(() => container.classList.remove('shake'), 200);
        }

        displayAlert("LASER FIRED!", false);

        for (let i = pipes.length - 1; i >= 0; i--) {
            if (pipes[i].x + pipeConfig.width > bird.x) {
                for (let p = 0; p < 30; p++) {
                    particles.push(new Particle(pipes[i].x + pipeConfig.width / 2, bird.y + (Math.random() - 0.5) * 80, '#00f2fe'));
                    particles.push(new Particle(pipes[i].x + pipeConfig.width / 2, bird.y + (Math.random() - 0.5) * 80, '#ff007f'));
                }
                pipes.splice(i, 1);
            }
        }
    }

    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.size = Math.random() * 3 + 1.5;
            this.speedX = Math.random() * -3 - 1;
            this.speedY = (Math.random() - 0.5) * 3;
            this.color = color;
            this.alpha = 1;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.alpha -= 0.025;
        }
        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function displayAlert(text, isShield = false) {
        if (levelAlert) {
            levelAlert.innerHTML = text;
            levelAlert.style.textShadow = isShield ? "0 0 15px #ffe600, 0 0 30px #ffe600" : "0 0 15px #00f2fe, 0 0 30px #ff007f";
            levelAlert.classList.remove('level-active');
            void levelAlert.offsetWidth;
            levelAlert.classList.add('level-active');
        }
    }

    function triggerLevelUp() {
        level++;
        if (currentLevelDOM) currentLevelDOM.textContent = level;

        pipeConfig.currentSpeed = pipeConfig.baseSpeed + (level - 1) * 0.4;
        pipeConfig.spawnRate = Math.max(65, 100 - (level - 1) * 5);
        pipeConfig.currentGap = Math.max(pipeConfig.minGap, pipeConfig.baseGap - (level - 1) * 10);
        pipeConfig.verticalSpeed = (level - 1) * 0.8;

        setTimeout(() => playSound(523.25, 'triangle', 0.15), 0);
        setTimeout(() => playSound(659.25, 'triangle', 0.15), 100);
        setTimeout(() => playSound(783.99, 'triangle', 0.3), 200);

        if (flashEffect) {
            flashEffect.classList.remove('flash-active');
            void flashEffect.offsetWidth;
            flashEffect.classList.add('flash-active');
        }

        let alertSubText = level === 2 ? "BARREIRAS MÓVEIS ATIVADAS!" : "VÃOS MAIS RÁPIDOS E ESTREITOS!";
        displayAlert(`LEVEL ${level}<br><span style="font-size:1.1rem; letter-spacing:1px; color:#ff007f;">${alertSubText}</span>`);

        for (let i = 0; i < 40; i++) {
            particles.push(new Particle(
                Math.random() * canvas.width, 
                Math.random() * canvas.height, 
                Math.random() > 0.5 ? '#ffe600' : '#00f2fe'
            ));
        }
    }

    function setShield(state) {
        hasShield = state;
        if (shieldStatusDOM) {
            shieldStatusDOM.textContent = state ? "ON" : "OFF";
            if (state) {
                shieldStatusDOM.classList.add('shield-on-text');
            } else {
                shieldStatusDOM.classList.remove('shield-on-text');
            }
        }
    }

    function resetGame() {
        score = 0;
        level = 1;
        laserCharge = 0;
        laserActiveTimer = 0;
        pipeConfig.currentSpeed = pipeConfig.baseSpeed;
        pipeConfig.currentGap = pipeConfig.baseGap; 
        pipeConfig.spawnRate = 100;
        pipeConfig.timer = 0;
        pipeConfig.verticalSpeed = 0; 
        setShield(false);

        if (currentScoreDOM) currentScoreDOM.textContent = score;
        if (currentLevelDOM) currentLevelDOM.textContent = level;
        if (laserChargeBar) laserChargeBar.style.width = '0%';
        if (laserReadyText) laserReadyText.classList.remove('ready-pulse');
        
        bird.y = 300;
        bird.velocity = 0;
        bird.trail = [];
        pipes = [];
        particles = [];
        items = [];
        gameActive = true;
        if (overlay) overlay.classList.remove('active');
        
        cancelAnimationFrame(gameEngine);
        gameEngine = requestAnimationFrame(update);
    }

    function gameOver() {
        gameActive = false;
        playSound(150, 'sawtooth', 0.5, 40);
        
        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem('cyberbird-best', bestScore);
            if (bestScoreDOM) bestScoreDOM.textContent = bestScore;
        }

        if (container) {
            container.classList.add('shake');
            setTimeout(() => container.classList.remove('shake'), 200);
        }

        if (gameTitle) gameTitle.innerHTML = "GAME<span>OVER</span>";
        
        const ins = document.getElementById('game-instruction');
        if (ins) ins.innerHTML = `NÚCLEO ROMPIDO NO LEVEL ${level}<br><br>Pontos: <span class="highlight">${score}</span>`;
        if (startBtn) startBtn.textContent = "RECONECTAR";
        if (overlay) overlay.classList.add('active');
    }

    // ==========================================
    // LOOP PRINCIPAL DE RENDERIZAÇÃO
    // ==========================================
    function update() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        background.updateAndDraw();

        if (!gameActive) {
            gameEngine = requestAnimationFrame(update);
            return;
        }

        if (laserCharge < 100) {
            laserCharge += 0.25; 
            if (laserCharge >= 100) {
                laserCharge = 100;
                if (laserReadyText) laserReadyText.classList.add('ready-pulse');
                playSound(500, 'sine', 0.15, 800); 
            }
            if (laserChargeBar) laserChargeBar.style.width = `${laserCharge}%`;
        }

        bird.trail.push({ x: bird.x, y: bird.y });
        if (bird.trail.length > 12) bird.trail.shift();

        for (let i = 0; i < bird.trail.length; i++) {
            let ratio = i / bird.trail.length;
            ctx.beginPath();
            ctx.arc(bird.trail[i].x, bird.trail[i].y, bird.radius * ratio, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 0, 127, ${ratio * 0.35})`;
            ctx.fill();
        }

        bird.velocity += bird.gravity;
        bird.y += bird.velocity;

        if (hasShield) {
            ctx.save();
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ffe600';
            ctx.strokeStyle = `rgba(255, 230, 0, ${0.4 + Math.sin(Date.now() * 0.01) * 0.2})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(bird.x, bird.y, bird.radius + 12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        if (laserActiveTimer > 0) {
            laserActiveTimer--;
            ctx.save();
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ff007f';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = laserActiveTimer > 5 ? 12 : laserActiveTimer * 2;
            
            ctx.beginPath();
            ctx.moveTo(bird.x + 15, bird.y);
            ctx.lineTo(canvas.width, bird.y);
            ctx.stroke();

            ctx.strokeStyle = '#ff007f';
            ctx.lineWidth = laserActiveTimer > 5 ? 4 : 1;
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff007f';
        ctx.fillStyle = '#ff007f';
        
        ctx.translate(bird.x, bird.y);
        ctx.rotate(Math.min(Math.max(bird.velocity * 0.04, -0.4), 0.7));
        
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -9);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-10, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        if (bird.y + bird.radius >= canvas.height - 30 || bird.y - bird.radius <= 0) {
            gameOver();
            return;
        }

        pipeConfig.timer++;
        if (pipeConfig.timer % pipeConfig.spawnRate === 0) {
            const minHeight = 60;
            const maxHeight = (canvas.height - 30) - pipeConfig.currentGap - minHeight;
            const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
            
            pipes.push({
                x: canvas.width,
                top: topHeight,
                bottom: (canvas.height - 30) - topHeight - pipeConfig.currentGap,
                passed: false,
                direction: Math.random() > 0.5 ? 1 : -1
            });

            if (Math.random() < 0.25) {
                items.push({
                    x: canvas.width + pipeConfig.width / 2,
                    y: topHeight + pipeConfig.currentGap / 2 + (Math.random() - 0.5) * 40,
                    radius: 9,
                    pulse: 0
                });
            }
        }

        for (let i = items.length - 1; i >= 0; i--) {
            items[i].x -= pipeConfig.currentSpeed;
            items[i].pulse += 0.07;

            ctx.save();
            let glow = 8 + Math.sin(items[i].pulse) * 5;
            ctx.shadowBlur = glow;
            ctx.shadowColor = '#ffe600';
            ctx.fillStyle = '#ffe600';
            ctx.beginPath();
            ctx.arc(items[i].x, items[i].y, items[i].radius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(items[i].x, items[i].y, items[i].radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            let dist = Math.hypot(bird.x - items[i].x, bird.y - items[i].y);
            if (dist < bird.radius + items[i].radius) {
                playSound(600, 'sine', 0.2, 1000);
                setShield(true);
                displayAlert("SHIELD ACTIVATED", true);
                
                for (let p = 0; p < 15; p++) {
                    particles.push(new Particle(items[i].x, items[i].y, '#ffe600'));
                }
                items.splice(i, 1);
                continue;
            }

            if (items[i].x + 20 < 0) items.splice(i, 1);
        }

        for (let i = pipes.length - 1; i >= 0; i--) {
            pipes[i].x -= pipeConfig.currentSpeed;

            if (pipeConfig.verticalSpeed > 0) {
                pipes[i].top += pipeConfig.verticalSpeed * pipes[i].direction;
                pipes[i].bottom -= pipeConfig.verticalSpeed * pipes[i].direction;

                if (pipes[i].top < 40 || (canvas.height - 30) - pipes[i].bottom > canvas.height - 70) {
                    pipes[i].direction *= -1; 
                }
            }

            ctx.save();
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#00f2fe';
            ctx.fillStyle = 'rgba(0, 242, 254, 0.15)';
            ctx.strokeStyle = '#00f2fe';
            ctx.lineWidth = 3;

            ctx.fillRect(pipes[i].x, 0, pipeConfig.width, pipes[i].top);
            ctx.strokeRect(pipes[i].x, -5, pipeConfig.width, pipes[i].top + 5);

            ctx.fillRect(pipes[i].x, (canvas.height - 30) - pipes[i].bottom, pipeConfig.width, pipes[i].bottom);
            ctx.strokeRect(pipes[i].x, (canvas.height - 30) - pipes[i].bottom, pipeConfig.width, pipes[i].bottom + 5);
            ctx.restore();

            if (
                bird.x + bird.radius > pipes[i].x &&
                bird.x - bird.radius < pipes[i].x + pipeConfig.width
            ) {
                if (bird.y - bird.radius < pipes[i].top || bird.y + bird.radius > (canvas.height - 30) - pipes[i].bottom) {
                    
                    if (hasShield) {
                        playSound(300, 'sawtooth', 0.3, 100);
                        setShield(false);
                        displayAlert("SHIELD BROKEN", true);

                        if (flashEffect) {
                            flashEffect.classList.remove('flash-active');
                            void flashEffect.offsetWidth;
                            flashEffect.classList.add('flash-active');
                        }

                        for (let p = 0; p < 25; p++) {
                            particles.push(new Particle(pipes[i].x + pipeConfig.width/2, bird.y, '#ffe600'));
                        }

                        pipes.splice(i, 1);
                        continue;
                    } else {
                        gameOver();
                        return;
                    }
                }
            }

            if (!pipes[i].passed && pipes[i].x + pipeConfig.width < bird.x) {
                pipes[i].passed = true;
                score++;
                if (currentScoreDOM) currentScoreDOM.textContent = score;
                playSound(880, 'sine', 0.08);
                
                if (score % 100 === 0) {
                    triggerLevelUp();
                } else {
                    for(let p=0; p<12; p++) {
                        particles.push(new Particle(bird.x, bird.y, '#00f2fe'));
                    }
                }
            }

            if (pipes[i].x + pipeConfig.width < 0) {
                pipes.splice(i, 1);
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw();
            if (particles[i].alpha <= 0) {
                particles.splice(i, 1);
            }
        }

        gameEngine = requestAnimationFrame(update);
    }

    function initialDraw() {
        background.updateAndDraw();
        if(!gameActive) requestAnimationFrame(initialDraw);
    }
    initialDraw();
});

