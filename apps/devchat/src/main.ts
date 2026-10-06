import { createAdvisorClient, chatReducer, initialChatState, type ChatAction, type ChatState, errorText, tierLabel, whatsappUrl } from '@pcadvisor/advisor-client';
import { formatArs, type AdvisorConfig } from '@pcadvisor/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const STORE_ID = import.meta.env.VITE_STORE_ID || '900000001';

const client = createAdvisorClient({ baseUrl: API_URL, storeId: STORE_ID });

let state: ChatState = initialChatState;
let config: AdvisorConfig | null = null;

function getSessionId(): string {
  let id = sessionStorage.getItem('sessionId');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('sessionId', id);
  }
  return id;
}

function resetSessionId() {
  sessionStorage.removeItem('sessionId');
}

let sessionId = getSessionId();

const els = {
  messages: document.getElementById('messages')!,
  suggestions: document.getElementById('suggestions')!,
  input: document.getElementById('chat-input') as HTMLInputElement,
  sendBtn: document.getElementById('send-btn') as HTMLButtonElement,
  form: document.getElementById('input-area') as HTMLFormElement,
  resetBtn: document.getElementById('reset-btn') as HTMLButtonElement,
  cartSim: document.getElementById('cart-simulation')!,
  cartItems: document.getElementById('cart-items')!,
};

function dispatch(action: ChatAction) {
  state = chatReducer(state, action);
  render();
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function render() {
  els.messages.innerHTML = ''; // safe to clear
  
  for (const msg of state.messages) {
    const div = el('div', `message ${msg.kind}`);
    if (msg.kind === 'error') {
      div.textContent = errorText(msg.error);
    } else if (msg.kind === 'user') {
      div.textContent = msg.text;
    } else if (msg.kind === 'assistant') {
      div.textContent = msg.text;
      
      if (msg.builds.length > 0) {
        for (const build of msg.builds) {
          const card = el('div', 'build-card');
          
          const label = tierLabel(build, msg.builds.length);
          if (label) {
            card.appendChild(el('div', 'build-tier', label));
          }
          
          const ul = el('ul', 'build-items');
          for (const item of build.items) {
            const qtyStr = item.qty > 1 ? ` x${item.qty}` : '';
            ul.appendChild(el('li', '', `${item.name}${qtyStr}`));
          }
          card.appendChild(ul);
          
          card.appendChild(el('div', 'build-total', `Total: ${formatArs(build.totalCents)}`));
          
          if (build.warnings.length > 0) {
            const wUl = el('ul', 'build-warnings');
            for (const w of build.warnings) {
              wUl.appendChild(el('li', '', w));
            }
            card.appendChild(wUl);
          }
          
          if (config && msg.recommendationId) {
            const btn = el('button', 'build-action') as HTMLButtonElement;
            if (config.checkoutMode === 'cart') {
              btn.textContent = 'Agregar al carrito';
              btn.onclick = () => {
                client.sendEvent(msg.recommendationId!, 'cart_added', build.id);
                showCartSim(build.items.map(i => ({ variant: i.tnVariantId, qty: i.qty })));
              };
            } else if (config.checkoutMode === 'whatsapp') {
              btn.textContent = 'Consultar por WhatsApp';
              if (config.whatsappNumber) {
                btn.onclick = () => {
                  client.sendEvent(msg.recommendationId!, 'whatsapp_clicked', build.id);
                  window.open(whatsappUrl(config!.whatsappNumber!, build, msg.recommendationId!), '_blank');
                };
              } else {
                btn.disabled = true;
              }
            }
            card.appendChild(btn);
          }
          
          div.appendChild(card);
        }
      }
    }
    els.messages.appendChild(div);
  }
  
  if (state.pending) {
    els.messages.appendChild(el('div', 'typing', 'Escribiendo...'));
  }
  
  els.messages.scrollTop = els.messages.scrollHeight;
  
  els.suggestions.innerHTML = '';
  for (const sug of state.suggestions) {
    const btn = el('button', 'chip', sug);
    btn.onclick = () => sendMsg(sug);
    els.suggestions.appendChild(btn);
  }
  
  const disabled = state.pending || state.limitReached;
  els.input.disabled = disabled;
  els.sendBtn.disabled = disabled;
  if (!disabled) els.input.focus();
}

function showCartSim(items: { variant: number, qty: number }[]) {
  els.cartSim.style.display = 'block';
  els.cartItems.innerHTML = '';
  for (const item of items) {
    els.cartItems.appendChild(el('li', '', `Variante ${item.variant} x${item.qty}`));
  }
  setTimeout(() => { els.cartSim.style.display = 'none'; }, 3000);
}

async function sendMsg(text: string) {
  if (!text.trim() || state.pending || state.limitReached) return;
  dispatch({ type: 'user_sent', text });
  els.input.value = '';
  
  const res = await client.sendMessage(sessionId, text);
  if (res.ok) {
    dispatch({ type: 'response_received', response: res.value });
  } else {
    dispatch({ type: 'request_failed', error: res.error });
  }
}

els.form.onsubmit = (e) => {
  e.preventDefault();
  sendMsg(els.input.value);
};

els.resetBtn.onclick = () => {
  resetSessionId();
  sessionId = getSessionId();
  dispatch({ type: 'reset', initialSuggestions: config?.initialSuggestions || [] });
};

async function init() {
  const res = await client.getConfig();
  if (res.ok) {
    config = res.value;
    dispatch({ type: 'config_loaded', config: res.value });
  } else {
    dispatch({ type: 'request_failed', error: res.error });
  }
}

init();
