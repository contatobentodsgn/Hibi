/**
 * O modo "intenção" do cérebro offline: em vez de conversar, o modelo lê um pedido e devolve só um JSON
 * com a ação, o assunto, o dia e o horário — como a pessoa os disse. A gramática gerada deste schema
 * obriga a saída a ser esse JSON; quem calcula a data, confere conflitos e pede confirmação é o código
 * determinístico do Taby, nunca o modelo. O schema mora aqui, no processo principal: o renderer escolhe
 * o modo, não a gramática.
 */
const INTENT_ACTIONS = Object.freeze(['meeting', 'task', 'reminder', 'note', 'focus', 'agenda', 'none']);

const INTENT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    action: { enum: [...INTENT_ACTIONS] },
    title: { type: 'string' },
    day: { type: 'string' },
    time: { type: 'string' },
    endTime: { type: 'string' },
  },
  required: ['action', 'title', 'day', 'time', 'endTime'],
});

const LOCAL_MODEL_MODES = Object.freeze(['chat', 'intent']);
const modeOf = (value) => (value === 'intent' ? 'intent' : 'chat');

module.exports = { INTENT_ACTIONS, INTENT_SCHEMA, LOCAL_MODEL_MODES, modeOf };
