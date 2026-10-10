// Shared by the "invite your manager" form and the Home ask: the key that
// records the driver has answered, so neither asks again. Two copies of a
// persistence key drift the moment one is renamed, so there is one.
export const NOMINATE_PROMPT_STATE_KEY = "nominate_manager_prompt_state";
