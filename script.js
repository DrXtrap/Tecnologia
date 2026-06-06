/* ============================================
   JTECH — SCRIPT PRINCIPAL
   Scroll suave + sistema de partículas do hero.
   ============================================ */

(() => {
    'use strict';

    const CONFIG_SCROLL = {
        duracao: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        suavidadeMouse: 1.0,
        suavidadeToque: 1.0,
    };

    const ehMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;

    const CONFIG_PARTICULAS = {
        quantidade: ehMobileViewport() ? 22 : 60,
        raioMin: 0.8,
        raioMax: 2.2,
        velocidadeMax: 0.25,
        distanciaConexao: ehMobileViewport() ? 90 : 140,
        corRgb: '180, 140, 80',
        opacidadeParticula: 0.55,
        opacidadeConexaoMax: 0.18,
    };

    const TEMPO_DEBOUNCE_REDIMENSIONAR_MS = 150;

    /* --------------------------------------------
       SCROLL SUAVE (Lenis)
       -------------------------------------------- */

    const ehDispositivoToque = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    const iniciarScrollSuave = () => {
        if (typeof Lenis === 'undefined') return null;
        if (ehDispositivoToque()) return null;

        const lenis = new Lenis({
            duration: CONFIG_SCROLL.duracao,
            easing: CONFIG_SCROLL.easing,
            mouseMultiplier: CONFIG_SCROLL.suavidadeMouse,
            touchMultiplier: CONFIG_SCROLL.suavidadeToque,
            smoothWheel: true,
        });

        return lenis;
    };

    const sincronizarLenisComGsap = (lenis) => {
        if (!lenis || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
            if (lenis) {
                const tickFallback = (tempo) => {
                    lenis.raf(tempo);
                    requestAnimationFrame(tickFallback);
                };
                requestAnimationFrame(tickFallback);
            }
            return;
        }

        lenis.on('scroll', ScrollTrigger.update);

        gsap.ticker.add((tempo) => {
            lenis.raf(tempo * 1000);
        });
        gsap.ticker.lagSmoothing(0);
    };

    /* --------------------------------------------
       SISTEMA DE PARTÍCULAS
       -------------------------------------------- */

    const criarParticula = (largura, altura) => ({
        x: Math.random() * largura,
        y: Math.random() * altura,
        vx: (Math.random() - 0.5) * CONFIG_PARTICULAS.velocidadeMax,
        vy: (Math.random() - 0.5) * CONFIG_PARTICULAS.velocidadeMax,
        raio: CONFIG_PARTICULAS.raioMin +
              Math.random() * (CONFIG_PARTICULAS.raioMax - CONFIG_PARTICULAS.raioMin),
    });

    const moverParticula = (particula, largura, altura) => {
        particula.x += particula.vx;
        particula.y += particula.vy;

        if (particula.x < 0) particula.x = largura;
        if (particula.x > largura) particula.x = 0;
        if (particula.y < 0) particula.y = altura;
        if (particula.y > altura) particula.y = 0;
    };

    const desenharParticula = (ctx, particula) => {
        ctx.beginPath();
        ctx.arc(particula.x, particula.y, particula.raio, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${CONFIG_PARTICULAS.corRgb}, ${CONFIG_PARTICULAS.opacidadeParticula})`;
        ctx.fill();
    };

    const desenharConexao = (ctx, p1, p2) => {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distancia = Math.sqrt(dx * dx + dy * dy);

        if (distancia >= CONFIG_PARTICULAS.distanciaConexao) return;

        const proximidade = 1 - distancia / CONFIG_PARTICULAS.distanciaConexao;
        const alpha = proximidade * CONFIG_PARTICULAS.opacidadeConexaoMax;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(${CONFIG_PARTICULAS.corRgb}, ${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
    };

    const iniciarSistemaParticulas = (canvas) => {
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let largura = 0;
        let altura = 0;
        let particulas = [];
        let frameId = null;
        let ativo = true;

        const redimensionar = () => {
            largura = canvas.clientWidth;
            altura = canvas.clientHeight;
            canvas.width = largura * dpr;
            canvas.height = altura * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const popularParticulas = () => {
            particulas = Array.from(
                { length: CONFIG_PARTICULAS.quantidade },
                () => criarParticula(largura, altura)
            );
        };

        const desenharFrame = () => {
            if (!ativo) return;

            ctx.clearRect(0, 0, largura, altura);

            for (let i = 0; i < particulas.length; i++) {
                moverParticula(particulas[i], largura, altura);
                desenharParticula(ctx, particulas[i]);

                for (let j = i + 1; j < particulas.length; j++) {
                    desenharConexao(ctx, particulas[i], particulas[j]);
                }
            }

            frameId = requestAnimationFrame(desenharFrame);
        };

        const pausar = () => {
            ativo = false;
            if (frameId) cancelAnimationFrame(frameId);
        };

        const retomar = () => {
            if (ativo) return;
            ativo = true;
            desenharFrame();
        };

        const observador = new IntersectionObserver(
            ([entrada]) => entrada.isIntersecting ? retomar() : pausar(),
            { threshold: 0 }
        );
        observador.observe(canvas);

        let idTimeoutResize = null;
        window.addEventListener('resize', () => {
            clearTimeout(idTimeoutResize);
            idTimeoutResize = setTimeout(() => {
                redimensionar();
                popularParticulas();
            }, TEMPO_DEBOUNCE_REDIMENSIONAR_MS);
        });

        redimensionar();
        popularParticulas();
        desenharFrame();
    };

    /* --------------------------------------------
       SCROLL HORIZONTAL DOS SERVIÇOS (GSAP + ScrollTrigger)
       -------------------------------------------- */

    const CONFIG_PIN_HORIZONTAL = {
        scrubDesktop: 1,
        scrubMobile: true,
        anticipatePin: 1,
        /** Scroll vertical extra depois do fim do arrasto horizontal — menor = sai do pin mais rápido */
        fatorBufferSaida: 0.22,
        /** Pausa no fim da timeline (scrub); menor = menos “inércia” ao soltar */
        duracaoPausaFinalTimeline: 0.12,
    };

    const reduzirMovimento = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const iniciarScrollHorizontal = () => {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        const pinWrapper = document.querySelector('.servicos__pin-wrapper');
        const viewport = document.querySelector('.servicos__viewport');
        const pista = document.querySelector('.servicos__pista');
        if (!pinWrapper || !viewport || !pista) return;

        const calcularDistanciaPercorrida = () => pista.scrollWidth - window.innerWidth;
        const ehMobile = window.matchMedia('(max-width: 768px)').matches;
        const buffer = () => window.innerHeight * CONFIG_PIN_HORIZONTAL.fatorBufferSaida;

        gsap.timeline({
            scrollTrigger: {
                trigger: viewport,
                start: 'top top',
                end: () => `+=${calcularDistanciaPercorrida() + buffer()}`,
                scrub: ehMobile ? CONFIG_PIN_HORIZONTAL.scrubMobile : CONFIG_PIN_HORIZONTAL.scrubDesktop,
                pin: true,
                anticipatePin: CONFIG_PIN_HORIZONTAL.anticipatePin,
                invalidateOnRefresh: true,
            },
        })
        .to(pista, { x: () => -calcularDistanciaPercorrida(), ease: 'none' }, 0)
        .to({}, { duration: CONFIG_PIN_HORIZONTAL.duracaoPausaFinalTimeline });
    };

    /* --------------------------------------------
       ANIMAÇÕES DOS ÍCONES DOS CARDS
       -------------------------------------------- */

    const CONFIG_ENGRENAGENS = {
        duracaoGrande: 8,
        duracaoMedia: 6,
        duracaoPequena: 4,
    };

    const iniciarAnimacoesIcones = () => {
        if (typeof gsap === 'undefined') return;

        const tweens = [];

        const girarInfinito = (seletor, duracao, sentidoHorario = true) => {
            const elemento = document.querySelector(seletor);
            if (!elemento) return null;
            const tween = gsap.to(elemento, {
                rotation: sentidoHorario ? 360 : -360,
                duration: duracao,
                ease: 'none',
                repeat: -1,
                transformOrigin: '50% 50%',
            });
            return tween;
        };

        tweens.push(girarInfinito('.icone-sistemas__engrenagem--grande', CONFIG_ENGRENAGENS.duracaoGrande, true));
        tweens.push(girarInfinito('.icone-sistemas__engrenagem--media', CONFIG_ENGRENAGENS.duracaoMedia, false));
        tweens.push(girarInfinito('.icone-sistemas__engrenagem--pequena', CONFIG_ENGRENAGENS.duracaoPequena, true));

        const cardSistemas = document.querySelector('.servico-card[data-card-indice="1"]');
        if (cardSistemas) {
            const observador = new IntersectionObserver(([entrada]) => {
                tweens.forEach((t) => {
                    if (!t) return;
                    entrada.isIntersecting ? t.play() : t.pause();
                });
            }, { threshold: 0.1 });
            observador.observe(cardSistemas);
        }
    };

    /* --------------------------------------------
       BOTÃO VOLTAR AO TOPO
       -------------------------------------------- */

    const iniciarVoltarTopo = () => {
        const botao = document.getElementById('voltar-topo');
        if (!botao) return;

        const atualizar = () => {
            botao.classList.toggle('voltar-topo--visivel', window.scrollY > window.innerHeight * 0.6);
        };

        atualizar();
        window.addEventListener('scroll', atualizar, { passive: true });

        botao.addEventListener('click', () => {
            if (typeof window.lenisInstancia !== 'undefined' && window.lenisInstancia) {
                window.lenisInstancia.scrollTo(0, { duration: 1.4 });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    };

    /* --------------------------------------------
       HEADER REATIVO AO SCROLL
       -------------------------------------------- */

    const iniciarHeaderScroll = () => {
        const cabecalho = document.querySelector('.cabecalho');
        const links = document.querySelectorAll('.cabecalho__nav a[href^="#"]');
        const secoes = [...links]
            .map((link) => {
                const id = link.getAttribute('href').slice(1);
                if (!id) return null;
                const el = document.getElementById(id);
                return el ? { link, el } : null;
            })
            .filter(Boolean);

        if (!cabecalho) return;

        const atualizarEstadoScroll = () => {
            const scrolled = window.scrollY > 24;
            cabecalho.classList.toggle('cabecalho--scrolled', scrolled);
        };

        atualizarEstadoScroll();
        window.addEventListener('scroll', atualizarEstadoScroll, { passive: true });

        if (secoes.length > 0) {
            const observador = new IntersectionObserver((entradas) => {
                entradas.forEach((entrada) => {
                    if (entrada.isIntersecting) {
                        secoes.forEach(({ link }) => link.classList.remove('cabecalho__nav-link--ativo'));
                        const ativa = secoes.find(({ el }) => el === entrada.target);
                        if (ativa) ativa.link.classList.add('cabecalho__nav-link--ativo');
                    }
                });
            }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

            secoes.forEach(({ el }) => observador.observe(el));
        }

        const inicio = document.getElementById('inicio');
        if (inicio && secoes.length > 0) {
            const obsInicio = new IntersectionObserver(
                ([entrada]) => {
                    if (entrada.isIntersecting && entrada.intersectionRatio > 0.35) {
                        secoes.forEach(({ link }) => link.classList.remove('cabecalho__nav-link--ativo'));
                    }
                },
                { threshold: [0, 0.25, 0.5, 1], rootMargin: '0px 0px -15% 0px' }
            );
            obsInicio.observe(inicio);
        }
    };

    /* --------------------------------------------
       TIMELINE DO PROCESSO (reveal ao scroll)
       -------------------------------------------- */

    const iniciarTimelineProcesso = () => {
        const timeline = document.querySelector('.processo__timeline');
        const linha = document.querySelector('.processo__linha');
        const passos = document.querySelectorAll('.processo__passo');
        if (!timeline || !linha || passos.length === 0) return;

        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
            linha.classList.add('processo__linha--ativa');
            passos.forEach((p) => p.classList.add('processo__passo--ativo'));
            return;
        }

        gsap.fromTo(
            linha,
            { scaleY: 0 },
            {
                scaleY: 1,
                ease: 'none',
                scrollTrigger: {
                    trigger: timeline,
                    start: 'top 75%',
                    end: 'bottom 60%',
                    scrub: true,
                    invalidateOnRefresh: true,
                },
            }
        );

        passos.forEach((passo) => {
            gsap.fromTo(
                passo,
                { opacity: 0, y: 40 },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.7,
                    ease: 'power2.out',
                    scrollTrigger: {
                        trigger: passo,
                        start: 'top 80%',
                        toggleActions: 'play none none reverse',
                        onEnter: () => passo.classList.add('processo__passo--ativo'),
                        onLeaveBack: () => passo.classList.remove('processo__passo--ativo'),
                    },
                }
            );
        });
    };

    /* --------------------------------------------
       DEMO INTERATIVO — SISTEMAS
       -------------------------------------------- */

    const iniciarDemoSistema = () => {
        const demo = document.querySelector('.demo-sistema');
        if (!demo) return;

        const botoes = demo.querySelectorAll('.demo-btn');
        const status = demo.querySelector('[data-status]');
        const toast = demo.querySelector('[data-toast]');
        const toastTexto = demo.querySelector('[data-toast-texto]');
        const relogio = demo.querySelector('[data-relogio]');
        const kpiVendas = demo.querySelector('[data-kpi="vendas"]');
        const kpiPedidos = demo.querySelector('[data-kpi="pedidos"]');
        const kpiClientes = demo.querySelector('[data-kpi="clientes"]');
        const barras = demo.querySelectorAll('.demo-barra');

        if (!status || !toast || !toastTexto) return;

        // Relógio que atualiza em tempo real
        let idIntervaloRelogio = null;

        if (relogio) {
            const atualizarRelogio = () => {
                const agora = new Date();
                const h = String(agora.getHours()).padStart(2, '0');
                const m = String(agora.getMinutes()).padStart(2, '0');
                const s = String(agora.getSeconds()).padStart(2, '0');
                relogio.textContent = `${h}:${m}:${s}`;
            };

            const observadorDemo = new IntersectionObserver(
                ([entrada]) => {
                    if (entrada.isIntersecting) {
                        atualizarRelogio();
                        if (!idIntervaloRelogio) {
                            idIntervaloRelogio = setInterval(atualizarRelogio, 1000);
                        }
                    } else if (idIntervaloRelogio) {
                        clearInterval(idIntervaloRelogio);
                        idIntervaloRelogio = null;
                    }
                },
                { threshold: 0.12 }
            );
            observadorDemo.observe(demo);
        }

        const acoes = {
            relatorio: {
                statusTexto: '> Gerando relatório de vendas do mês...',
                statusFim: '> Relatório pronto · 847 linhas processadas',
                toast: 'Relatório gerado',
                duracao: 1800,
                destacar: () => kpiVendas?.parentElement.classList.add('kpi--destacado'),
            },
            cliente: {
                statusTexto: '> Cadastrando cliente e disparando boas-vindas...',
                statusFim: '> Cliente cadastrado · Total agora: 848',
                toast: 'Cliente adicionado',
                duracao: 1300,
                destacar: () => {
                    if (!kpiClientes) return;
                    kpiClientes.textContent = '848';
                    kpiClientes.parentElement.classList.add('kpi--destacado');
                },
            },
            email: {
                statusTexto: '> Disparando campanha pra 412 contatos...',
                statusFim: '> Emails enviados · Taxa de abertura média 34%',
                toast: 'Campanha enviada',
                duracao: 1600,
            },
            sincronizar: {
                statusTexto: '> Sincronizando WhatsApp, Sheets e estoque...',
                statusFim: '> Tudo sincronizado · 12 novos pedidos entraram',
                toast: 'Tudo sincronizado',
                duracao: 1800,
                destacar: () => {
                    if (kpiPedidos) {
                        kpiPedidos.textContent = '24';
                        kpiPedidos.parentElement.classList.add('kpi--destacado');
                    }
                    // Sacode o gráfico — gera novas alturas
                    barras.forEach((barra) => {
                        const alturaAtual = Number(barra.dataset.altura) || 40;
                        const novaAltura = Math.max(15, Math.min(85, alturaAtual + (Math.random() * 30 - 15)));
                        barra.setAttribute('height', novaAltura);
                        barra.setAttribute('y', 90 - novaAltura);
                        barra.dataset.altura = novaAltura;
                    });
                },
            },
        };

        let acaoAtiva = false;
        let toastTimeout = null;

        const limparDestaques = () => {
            demo.querySelectorAll('.kpi--destacado').forEach((el) => el.classList.remove('kpi--destacado'));
            botoes.forEach((b) => b.classList.remove('demo-btn--ativo'));
        };

        const mostrarToast = (mensagem) => {
            if (toastTimeout) clearTimeout(toastTimeout);
            toastTexto.textContent = mensagem;
            toast.classList.add('demo-toast--visivel');
            toastTimeout = setTimeout(() => {
                toast.classList.remove('demo-toast--visivel');
            }, 2600);
        };

        const executarAcao = (chave, botao) => {
            if (acaoAtiva) return;
            const acao = acoes[chave];
            if (!acao) return;

            acaoAtiva = true;
            limparDestaques();
            botao.classList.add('demo-btn--ativo');
            status.textContent = acao.statusTexto;

            setTimeout(() => {
                status.textContent = acao.statusFim;
                botao.classList.remove('demo-btn--ativo');
                acao.destacar?.();
                mostrarToast(acao.toast);
                acaoAtiva = false;

                setTimeout(() => {
                    if (!acaoAtiva && status.textContent === acao.statusFim) {
                        status.textContent = 'Sistema online · Aguardando próxima ação';
                    }
                }, 4000);
            }, acao.duracao);
        };

        botoes.forEach((botao) => {
            botao.addEventListener('click', () => {
                executarAcao(botao.dataset.acao, botao);
            });
        });
    };

    /* --------------------------------------------
       PIN HORIZONTAL DOS CASES
       -------------------------------------------- */

    const iniciarPinCases = () => {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        const pinWrapper = document.querySelector('.cases__pin-wrapper');
        const viewport = document.querySelector('.cases__viewport');
        const pista = document.querySelector('.cases__pista');
        if (!pinWrapper || !viewport || !pista) return;

        const calcularDistancia = () => Math.max(0, pista.scrollWidth - window.innerWidth);
        const ehMobile = window.matchMedia('(max-width: 768px)').matches;
        const buffer = () => window.innerHeight * CONFIG_PIN_HORIZONTAL.fatorBufferSaida;

        gsap.timeline({
            scrollTrigger: {
                trigger: viewport,
                start: 'top top',
                end: () => `+=${calcularDistancia() + buffer()}`,
                scrub: ehMobile ? CONFIG_PIN_HORIZONTAL.scrubMobile : CONFIG_PIN_HORIZONTAL.scrubDesktop,
                pin: true,
                anticipatePin: CONFIG_PIN_HORIZONTAL.anticipatePin,
                invalidateOnRefresh: true,
            },
        })
        .to(pista, { x: () => -calcularDistancia(), ease: 'none' }, 0)
        .to({}, { duration: CONFIG_PIN_HORIZONTAL.duracaoPausaFinalTimeline });
    };

    /* --------------------------------------------
       LINKS ÂNCORA (Lenis ou fallback; evita conflito com scroll-behavior CSS)
       -------------------------------------------- */

    const iniciarNavegacaoAncora = (lenis) => {
        const rolarPara = (alvoY) => {
            if (lenis) {
                lenis.scrollTo(alvoY, { duration: 1.15 });
            } else {
                window.scrollTo({ top: alvoY, behavior: 'smooth' });
            }
        };

        document.body.addEventListener('click', (evento) => {
            const link = evento.target.closest('a[href^="#"]');
            if (!link) return;

            const href = link.getAttribute('href');
            if (href === '#' || href === '#top') {
                evento.preventDefault();
                rolarPara(0);
                return;
            }

            const alvo = document.querySelector(href);
            if (!alvo) return;

            evento.preventDefault();
            const offsetCabecalho = 88;
            const topo =
                alvo.getBoundingClientRect().top + window.scrollY - offsetCabecalho;

            if (lenis) {
                lenis.scrollTo(alvo, { offset: -offsetCabecalho, duration: 1.15 });
            } else {
                window.scrollTo({ top: Math.max(0, topo), behavior: 'smooth' });
            }
        });
    };

    /* --------------------------------------------
       INICIALIZAÇÃO
       -------------------------------------------- */

    const iniciar = () => {
        if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
            gsap.registerPlugin(ScrollTrigger);
        }

        if (reduzirMovimento()) {
            document.querySelector('.processo__linha')?.classList.add('processo__linha--ativa');
            document.querySelectorAll('.processo__passo').forEach((passo) => {
                passo.classList.add('processo__passo--ativo');
            });
            iniciarDemoSistema();
            iniciarVoltarTopo();
            iniciarHeaderScroll();
            iniciarNavegacaoAncora(null);
            return;
        }

        const lenis = iniciarScrollSuave();
        window.lenisInstancia = lenis;
        sincronizarLenisComGsap(lenis);
        iniciarNavegacaoAncora(lenis);

        const canvasParticulas = document.querySelector('.hero__particulas');
        if (canvasParticulas) iniciarSistemaParticulas(canvasParticulas);

        iniciarScrollHorizontal();
        iniciarPinCases();
        iniciarTimelineProcesso();
        iniciarDemoSistema();
        iniciarAnimacoesIcones();
        iniciarHeaderScroll();
        iniciarVoltarTopo();

        document.fonts.ready.then(() => {
            requestAnimationFrame(() => {
                if (typeof ScrollTrigger !== 'undefined') {
                    ScrollTrigger.refresh();
                }
            });
        });
    };

    window.addEventListener('load', iniciar, { once: true });

})();
