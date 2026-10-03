# Browser verification: the key check

Follow-up 174. Three bad pastes reached `sloyd.llm.v1` during the batch variety live pass:
- 248 characters, with spaces and non-ASCII characters inside;
- 212 characters, well-formed but invalid;
- 230 characters, with whitespace inside.

Each was saved, then rejected by the API one paid call later, behind an error that said only
"API key was rejected — check Settings." This round adds three things:

- **On Save, a shape check:** a key with whitespace inside it, or any character outside
  printable ASCII, is refused instantly, with no network call.
- **On Save, a free verification call** (`GET /v1/models?limit=1`), which refuses a key the
  API rejects and shows the API's own reason.
- **The API's reason on the auth error a generation shows.**

There is **no prefix check**. The working key in the batch variety pass does not start
with `sk-ant-api`.

## How this was driven

Claude drove the dev server with the Playwright MCP (`npm run dev -- --host 127.0.0.1
--port 5180`), and the user watched. Claude typed the two refusal cases with real keyboard
input (`locator.fill`); neither is a secret. A `page.on('request')` listener recorded every
request to `api.anthropic.com`. The user pasted their real key for the third case, and its
value was never read.

| Case | Input | Seen | API calls |
|---|---|---|---|
| Shape | `sk-ant-abc defç` (a space and a non-ASCII `ç`) | *"That doesn't look like an API key — it contains spaces or unusual characters. Paste the key again."* | **none** |
| Rejected | a well-formed fake, `sk-ant-api03-thisIsNotARealKey…` | the button read **"Checking…"**, then *"The API rejected this key: API key is invalid."* The dialog stayed open and nothing was stored (`sloyd.llm.v1` stayed `null`) | one `GET /v1/models` |
| Valid | the user's real key | stored, model kept, dialog closed by itself | one `GET /v1/models` |

![Shape refused](img/keycheck-shape.png)
![Rejected by the API](img/keycheck-rejected.png)

The only console error was the expected 401 from the rejected case.

## Not seen live

- **The "Saved, but couldn't check it" note** (offline, rate limited, overloaded).
  Unit-tested.
- **The auth error with the API's reason appended, in a generation row.** Unit-tested
  against the SDK's own error class. A live generation with a bad key cannot be reached any
  more without bypassing Settings, which is the point of the round.

All of it was free: listing models is not billed. `localStorage` was cleared and read back
empty afterward, the browser was closed, and the dev server stopped.
