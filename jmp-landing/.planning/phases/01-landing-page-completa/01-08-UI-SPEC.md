---
phase: "01-08"
title: "GaleriaApartamento — Seção de Galeria de Fotos"
status: draft
date: 2026-06-08
author: gsd-ui-researcher
---

# UI-SPEC: GaleriaApartamento

## 1. Posição na Página

```
<main>
  <div hero-bg>          ← Form (existente)
  <LeilaoCard />         ← existente
  <GaleriaApartamento /> ← NOVO — inserir aqui
  <Form />               ← Form principal (existente, fora do hero)
</main>
<Footer />
```

> Inserir `<GaleriaApartamento />` em `src/App.tsx` imediatamente após `<LeilaoCard />` e antes do `<Form />` standalone (se houver) ou antes do `<Footer />` caso o Form já esteja dentro do hero.
> Baseado em `App.tsx` atual: o Form está dentro do bloco hero. A galeria entra após `<LeilaoCard />` e antes de `<Footer />`.

---

## 2. Design System

**Tool:** Tailwind CSS + tokens customizados (sem shadcn — nenhum `components.json` detectado)
**Font family:** Inter (carregada via Google Fonts em `index.css`)
**Token source:** `tailwind.config.js`

### Tokens registrados (pré-populados do codebase)

| Token | Valor | Uso |
|---|---|---|
| `gold.DEFAULT` | `#C8A96E` | Accent — headings de destaque, eyebrow |
| `gold.dark` | `#A68B4B` | Accent hover / estados escuros |
| `whatsapp` | `#25D366` | Exclusivo para ações WhatsApp — NÃO usar na galeria |
| `black` | `#000000` | Fundo primário da seção |
| `white` | `#FFFFFF` | Texto e ícones sobre fundo escuro |

A galeria **herda o dark mode do Footer** (seção sobre fundo preto) — não cria novos tokens de cor.

---

## 3. Spacing

Escala 8-point (múltiplos de 4px). Todos os valores abaixo mapeiam para classes Tailwind existentes.

| Uso | Valor | Classe Tailwind |
|---|---|---|
| Padding lateral da seção (mobile) | 20px | `px-5` |
| Padding lateral da seção (sm+) | 32px | `sm:px-8` |
| Padding vertical da seção (mobile) | 56px | `py-14` |
| Padding vertical da seção (sm+) | 72px | `sm:py-18` |
| Gap entre cards no grid | 16px | `gap-4` |
| Gap entre cards no grid (sm+) | 24px | `sm:gap-6` |
| Padding interno do caption | 12px vertical, 16px lateral | `px-4 py-3` |
| Tamanho mínimo de touch target | 44×44px | garantido via altura mínima dos cards |
| Eyebrow margin-bottom | 8px | `mb-2` |
| Heading margin-top (após eyebrow) | 8px | `mt-2` |
| Subtítulo margin-top | 8px | `mt-2` |
| Heading margin-bottom (antes do grid) | 32px | `mb-8` |

> Fonte dos valores: padrão já usado em `LeilaoCard` (`py-14 sm:py-18 px-5 sm:px-8`) — replicado para coerência visual.

---

## 4. Typography

**Regra geral:** 3 tamanhos de fonte, 3 pesos. Todos em Inter.

| Elemento | Tamanho | Peso | Line-height | Classe Tailwind |
|---|---|---|---|---|
| Eyebrow (label acima do heading) | 11px | 700 (bold) | — | `text-[11px] font-bold uppercase tracking-[0.18em]` |
| Section heading (h2) | 30px mobile / 36px sm+ | 900 (black) | 1.1 | `text-3xl font-black tracking-tight sm:text-4xl` |
| Section subheading | 16px | 400 (regular) | 1.5 | `text-base text-white/50` |
| Caption (sobreposição na foto) | 14px | 600 (semibold) | 1.4 | `text-sm font-semibold` |
| Placeholder label (estado vazio) | 14px | 600 (semibold) | 1.5 | `text-sm font-semibold` |

> Pesos em uso no projeto: 400 (regular), 600 (semibold), 700 (bold), 800 (extrabold), 900 (black via `font-black`). Galeria usa apenas 400, 600 e 900 — sem introduzir novos pesos.

---

## 5. Color Contract (60/30/10)

| Papel | Cor | Valor | Aplicação |
|---|---|---|---|
| 60% — Superfície dominante | Preto | `bg-black` | Fundo da seção inteira |
| 30% — Superfície secundária | Branco/8 | `bg-white/8` | Cards de placeholder; fundo do caption overlay |
| 10% — Accent | Gold | `text-gold` / `#C8A96E` | Eyebrow text; ícone no placeholder |

**Accent reservado exclusivamente para:**
- Texto do eyebrow ("Apartamos o seu lote" supertítulo)
- Ícone `Camera` (ou similar) no card de placeholder vazio
- Nada mais — não usar em botões, bordas ou fundos

**Cores de texto:**
| Elemento | Cor |
|---|---|
| Heading principal | `text-white` |
| Subtítulo / corpo | `text-white/50` |
| Caption texto | `text-white` |
| Placeholder label | `text-white/50` |
| Eyebrow | `text-white/50` (alternativa sem gold se heading já usar gold) |

**Bordas:**
| Elemento | Cor |
|---|---|
| Separador de seção (topo) | `border-t border-white/10` |
| Card placeholder | `border border-white/10` |
| Lightbox overlay background | `bg-black/90` |

---

## 6. Grid Layout

### Estrutura responsiva

```
mobile  (< 640px):  1 coluna
tablet  (640–1023px): 2 colunas  → grid-cols-2
desktop (≥ 1024px): 3 colunas   → lg:grid-cols-3
```

**Classe Tailwind do grid:**
```
grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3
```

### Proporção dos cards de foto

Razão de aspecto fixa: **4:3** em todos os breakpoints.
Implementar com `aspect-ratio` nativo:
```
aspect-[4/3] w-full overflow-hidden rounded-md
```

> Razão 4:3 escolhida: típica de fotos de campo/pecuária. Evita distorção vertical em fotos de animais. Alternativa aceita: 16:9 se o executor identificar que as fotos reais têm esse formato — registrar neste spec como override válido.

### Container da seção

```
<section id="galeria-apartamento" class="bg-black border-t border-white/10">
  <div class="mx-auto max-w-7xl px-5 sm:px-8 py-14 sm:py-18">
    <!-- heading block -->
    <!-- grid -->
  </div>
</section>
```

---

## 7. Componente: Card de Foto

### Estado: foto presente

```
<figure class="group relative aspect-[4/3] w-full overflow-hidden rounded-md cursor-pointer">
  <img
    src={foto.src}
    alt={foto.alt}
    width="800"
    height="600"
    loading="lazy"
    decoding="async"
    class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
  />
  <!-- Overlay ao hover/focus -->
  <figcaption class="
    absolute inset-x-0 bottom-0
    bg-gradient-to-t from-black/80 to-transparent
    px-4 py-3
    translate-y-full opacity-0
    transition-all duration-200
    group-hover:translate-y-0 group-hover:opacity-100
    group-focus-within:translate-y-0 group-focus-within:opacity-100
  ">
    <p class="text-sm font-semibold text-white leading-snug">{foto.caption}</p>
  </figcaption>
</figure>
```

**Interações:**
| Evento | Comportamento |
|---|---|
| `hover` (desktop) | `scale-105` na imagem (300ms, transform only); caption slide-up (200ms) |
| `click` / `tap` | Abre lightbox com a foto em tela cheia |
| `focus` (teclado) | Mesmo comportamento do hover (via `group-focus-within`) |
| `keydown Enter/Space` | Abre lightbox |

**Obrigatório:** `width` e `height` declarados em todo `<img>` para evitar CLS. Usar 800×600 como default (ajustável pelo executor conforme asset real).

### Estado: foto ausente (placeholder)

```
<div class="
  aspect-[4/3] w-full
  flex flex-col items-center justify-center gap-3
  rounded-md border border-white/10 bg-white/8
  text-white/30
">
  <!-- Ícone Camera (lucide-react, já é dependência do projeto) -->
  <Camera class="h-8 w-8 text-gold/60" aria-hidden />
  <span class="text-sm font-semibold text-white/50">Foto em breve</span>
</div>
```

> O ícone `Camera` está disponível via `lucide-react` (dependência já usada em LeilaoCard e Form). Importar de lá — não adicionar dependência nova.

---

## 8. Lightbox

### Comportamento

| Aspecto | Especificação |
|---|---|
| Trigger | `click` / `tap` em qualquer card de foto |
| Overlay | `fixed inset-0 bg-black/90 z-50 flex items-center justify-center` |
| Imagem | `max-h-[90vh] max-w-[90vw] object-contain rounded-md` |
| Fechar | Botão X (top-right) + tecla `Esc` + click fora da imagem |
| Animação | `opacity-0 → opacity-100` em 200ms (transform/opacity only) |
| Navegação | Fora do escopo desta fase — lightbox single-photo apenas |
| Acessibilidade | `role="dialog"` + `aria-modal="true"` + `aria-label="Foto ampliada"` + foco trapped dentro do dialog |

### Botão fechar

```
<button
  aria-label="Fechar galeria"
  class="
    absolute top-4 right-4
    flex h-11 w-11 items-center justify-center
    rounded-full bg-white/10 text-white
    transition-colors hover:bg-white/20
    focus:outline-none focus:ring-2 focus:ring-white/50
  "
>
  <X class="h-5 w-5" aria-hidden />
</button>
```

> Touch target: 44×44px (via `h-11 w-11`). Atende WCAG 2.5.5.

### Implementação recomendada

Implementar lightbox como estado React local (`useState<number | null>(null)`) no componente `GaleriaApartamento`. Sem biblioteca externa. O índice `null` = fechado; índice numérico = foto aberta.

```typescript
const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
```

---

## 9. Estrutura de Dados

```typescript
interface GaleriaFoto {
  src: string       // Caminho da imagem (import ou URL string)
  alt: string       // Texto alternativo descritivo — obrigatório
  caption?: string  // Legenda exibida no overlay hover (opcional)
}

// Array editável pelo dev — colocar no topo do componente
const FOTOS: GaleriaFoto[] = [
  // Adicionar fotos aqui. Exemplo:
  // { src: fotoApartamento1, alt: "Equipe Bula realizando apartação dos lotes", caption: "Apartação dos lotes — Junho 2026" },
]
```

**Comportamento por tamanho do array:**
| Quantidade de itens | Grid exibido |
|---|---|
| 0 | Seção oculta (retorna `null`) OU exibe 3 placeholders — a decidir pelo executor. **Recomendação: retornar `null` para não expor seção vazia em produção.** |
| 1–2 | Grid com itens reais + placeholders preenchendo até o múltiplo de colunas (opcional) |
| 3+ | Grid normal sem placeholders |

> Se o executor optar por mostrar placeholders com array vazio, renderizar no mínimo 3 cards placeholder (1 linha no desktop).

---

## 10. Copywriting

### Heading Block

| Elemento | Texto | Observação |
|---|---|---|
| Eyebrow (supertítulo) | `Bula Assessoria · Apartamento de lotes` | Confirmar com a equipe — texto provisório |
| H2 principal | `Apartamos o seu lote.` | Tom: afirmativo, serviço. Ponto final intencional. |
| Subtítulo | `Cada animal avaliado, classificado e apartado pela equipe Bula antes do martelo bater.` | Foco na prova social do serviço prestado |

**Alternativa de H2 (para aprovação da equipe):**
- `Veja o apartamento por dentro.`
- `Genética selecionada. Animal por animal.`

### Caption padrão para fotos sem legenda

Se `foto.caption` for `undefined`, não renderizar `<figcaption>` — nunca mostrar texto vazio.

### Estado vazio (placeholder)

| Elemento | Texto |
|---|---|
| Label do card placeholder | `Foto em breve` |
| Alt do ícone | (ícone é `aria-hidden`, sem alt) |

### Sem ações destrutivas

Esta seção não contém ações destrutivas (sem delete, sem formulário). Nenhum padrão de confirmação necessário.

---

## 11. Acessibilidade

| Requisito | Implementação |
|---|---|
| Imagens com alt | Todo `<img>` deve ter `alt` descritivo — jamais `alt=""` para foto real |
| Lightbox focus trap | Foco deve ficar preso dentro do dialog enquanto aberto |
| ESC fecha lightbox | `useEffect` com `keydown` listener |
| Cards clicáveis | Usar `<button>` wrapper ou `role="button"` + `tabIndex={0}` no `<figure>` |
| ARIA do lightbox | `role="dialog"` + `aria-modal="true"` + `aria-label="Foto ampliada: {foto.alt}"` |
| `aria-hidden` nos ícones decorativos | `Camera`, `X` e outros lucide icons recebem `aria-hidden` |
| Contraste do caption | Texto branco sobre gradiente `from-black/80` — ratio estimado > 7:1 (AA+) |

---

## 12. Performance

| Requisito | Implementação |
|---|---|
| Lazy loading | `loading="lazy"` em todos os `<img>` da galeria |
| Decodificação assíncrona | `decoding="async"` em todos os `<img>` |
| Evitar CLS | `width` e `height` declarados; `aspect-[4/3]` no container garante espaço antes da carga |
| Imagens grandes | Usar assets com máx. 1200px de largura; executor deve otimizar ao adicionar fotos |
| Animações | Apenas `transform` e `opacity` — nunca animar `width`, `height` ou `top/left` |

---

## 13. Animações (contrato rígido)

| Animação | Duração | Easing | Propriedades |
|---|---|---|---|
| Scale da foto no hover | 300ms | `ease-out` | `transform: scale(1.05)` |
| Caption slide-up | 200ms | `ease-out` | `transform: translateY` + `opacity` |
| Lightbox open | 200ms | `ease-out` | `opacity: 0 → 1` |
| Lightbox close | 150ms | `ease-in` | `opacity: 1 → 0` |

**Regra:** Nunca animar propriedades que forçam reflow (width, height, padding, margin, top, left).

---

## 14. Registry

**Ferramenta de design:** Tailwind CSS puro (sem shadcn, sem registries externos)
**Gate de segurança:** não aplicável — nenhuma dependência de registry de terceiros.
**Nova dependência introduzida:** nenhuma. `lucide-react` já é dependência ativa do projeto.

---

## 15. Estrutura de Arquivos a Criar

```
src/
  components/
    GaleriaApartamento.tsx   ← componente principal
```

Inserir no `App.tsx`:
```tsx
import { GaleriaApartamento } from './components/GaleriaApartamento'

// Entre LeilaoCard e Footer:
<LeilaoCard />
<GaleriaApartamento />
<Footer />
```

---

## 16. Checklist de Verificação (para gsd-ui-checker)

- [ ] Spacing exclusivamente em múltiplos de 4px
- [ ] Máx. 4 tamanhos de fonte declarados (este spec: 3)
- [ ] Máx. 3 pesos de fonte (este spec: 3: 400, 600, 900)
- [ ] Accent `gold` reservado apenas para eyebrow e ícone placeholder
- [ ] Touch targets mínimo 44×44px (lightbox X button: `h-11 w-11`)
- [ ] Lazy loading declarado
- [ ] CLS prevenido (`width`/`height` + `aspect-[4/3]`)
- [ ] Animações apenas em transform/opacity
- [ ] Lightbox com `role="dialog"` + `aria-modal`
- [ ] Nenhuma dependência nova adicionada
- [ ] Copywriting definido para todos os estados (foto, placeholder, lightbox)
