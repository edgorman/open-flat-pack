import {
  lazy,
  Suspense,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { PartsList } from "../components/PartsList";
import { useApp } from "../context/AppContext";
import { useCatalogue } from "../hooks/useCatalogue";
import {
  ApiError,
  designPath,
  errorMessage,
  type Design as DesignType,
  type Layout,
  type Validation,
} from "../lib/api";
import { finishColour, finishesOf } from "../lib/finishes";
import { drop } from "../lib/move";

// Three.js is most of the bundle, so it loads only once there is something to draw.
const Preview = lazy(() =>
  import("../components/Preview").then((m) => ({ default: m.Preview })),
);

/** How the preview tints parts the validator objects to. */
const INVALID = "#d1453b";

// prompt is the design's title: the first one typed here, or the edited design's, and renamable.
// It is unset on a fork until its first change.
type Result = { layout: Layout; notes: string[]; prompt?: string };

/** What a design page's Fork or Edit link passes: the design to start from. */
export type ForkState = { fork?: DesignType; edit?: DesignType };

/** Why a layout was refused: a 422's remaining errors, or none for any other failure. */
function problemsOf(e: unknown): string[] {
  return e instanceof ApiError && e.status === 422
    ? ((e.body as Validation | undefined)?.errors ?? []).map((p) => p.message)
    : [];
}

/**
 * Where a signed-in user designs something: a prompt goes to `POST /layouts`, and the layout comes
 * back as a preview and parts list. It stays unpublished in the page; another prompt refines it,
 * and Publish saves it with `POST /designs`. Opened from a design's Fork link, it starts from that
 * design's layout and publishes with `forkedFrom` set; from its Edit link, Save replaces that design.
 */
export function Design() {
  const { api, user, authError, authReady, renderSignInButton } = useApp();
  const { catalogue, error: catalogueError } = useCatalogue();
  const [prompt, setPrompt] = useState("");
  const navigate = useNavigate();
  const { fork, edit: original } =
    (useLocation().state as ForkState | null) ?? {};
  const [forkedFrom, setForkedFrom] = useState(fork?.id ?? "");
  const [editing, setEditing] = useState(original?.id ?? "");
  const start = fork ?? original;
  const [result, setResult] = useState<Result | null>(
    start
      ? {
          layout: start.layout ?? { parts: [] },
          notes: start.notes,
          prompt: original?.prompt,
        }
      : null,
  );
  const [working, setWorking] = useState(false);
  // Set while a prompt is with the model, as opposed to publishing.
  const [designing, setDesigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  // What the validator says about the layout after the last move.
  const [invalid, setInvalid] = useState<Validation["errors"]>([]);
  // The part last tapped in the preview, whose colour can be changed.
  const [selected, setSelected] = useState<number | null>(null);
  // Bumped by every check and refine, so only the latest check's answer is shown.
  const checks = useRef(0);
  const marks = useMemo(() => {
    const out: Record<number, string> = {};
    for (const e of invalid) if (e.part !== undefined) out[e.part] = INVALID;
    return out;
  }, [invalid]);

  if (!api) {
    return (
      <div className="page">
        <p className="text-muted center-note">
          No backend deployed yet - no backend URL is configured.
        </p>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="page center-note">
        <p className="text-muted">Sign in to design something.</p>
        {authError ? (
          <p role="alert">{authError}</p>
        ) : (
          <GoogleSignInButton ready={authReady} onRender={renderSignInButton} />
        )}
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setWorking(true);
    setDesigning(true);
    setError(null);
    setProblems([]);
    checks.current++;
    api
      .createLayout({ prompt, baseLayout: result?.layout })
      .then((res) => {
        setInvalid([]);
        setSelected(null);
        setResult({
          layout: res.layout ?? { parts: [] },
          notes: res.validation?.notes ?? [],
          prompt: result?.prompt ?? prompt,
        });
        setPrompt("");
      })
      .catch((e: unknown) => {
        setProblems(problemsOf(e));
        setError(
          problemsOf(e).length
            ? "Couldn't make a buildable design from that. Try rephrasing it."
            : errorMessage(e, "Failed to design"),
        );
      })
      .finally(() => {
        setWorking(false);
        setDesigning(false);
      });
  };

  // Shows a layout edited by hand, then has the backend check it; it stays editable either way.
  const edit = (layout: Layout) => {
    setResult((r) => r && { ...r, layout });
    const check = ++checks.current;
    api
      .checkLayout(layout)
      .then((v) => {
        if (check !== checks.current) return;
        setInvalid(v.errors);
        setResult((r) => r && { ...r, notes: v.notes });
      })
      .catch(
        (e: unknown) =>
          check === checks.current &&
          setError(errorMessage(e, "Failed to check the design")),
      );
  };

  // Snaps a dragged part into place.
  const place = (index: number, x: number, y: number) => {
    if (!result || !catalogue) return;
    const layout = drop(result.layout, catalogue, index, x, y);
    setError(layout ? null : "Nowhere free for it near there.");
    if (layout) edit(layout);
  };

  // The tapped part and the finishes it comes in; another finish is another article of the same size.
  const tapped = selected === null ? undefined : result?.layout.parts[selected];
  const finishes =
    tapped && catalogue ? finishesOf(catalogue, tapped.article) : [];
  const recolour = (article: string) =>
    result &&
    edit({
      ...result.layout,
      parts: result.layout.parts.map((p, k) =>
        k === selected ? { ...p, article } : p,
      ),
    });

  const publish = () => {
    if (!result?.prompt) return;
    setWorking(true);
    setError(null);
    setProblems([]);
    const req = { prompt: result.prompt, layout: result.layout };
    (editing
      ? api.updateDesign(editing, req)
      : api.createDesign({ ...req, forkedFrom })
    )
      .then((design) => navigate(designPath(design.id)))
      .catch((e: unknown) => {
        setProblems(problemsOf(e));
        setError(
          errorMessage(e, editing ? "Failed to save" : "Failed to publish"),
        );
        setWorking(false);
      });
  };

  return (
    <div className="page page-wide">
      <header className="page-header">
        <span className="page-kicker text-muted">
          {editing ? "Edit" : forkedFrom ? "Fork" : "Design"}
        </span>
        <h1 className="title-editor">
          {result ? "Refine your design" : "Describe your shelving"}
        </h1>
      </header>

      <form onSubmit={submit} className="prompt">
        <label htmlFor="design-prompt" className="prompt-label">
          {result ? "What should change?" : "What do you want?"}
        </label>
        <div className="prompt-bar">
          <textarea
            id="design-prompt"
            className="prompt-input"
            rows={2}
            placeholder={
              result
                ? "Make it one cube taller"
                : "A white 4×4 KALLAX with two doors and legs"
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={working || !prompt.trim()}
          >
            {working ? "Designing…" : result ? "Refine" : "Design"}
          </button>
        </div>
        {result && (
          <div className="prompt-actions">
            {/* A fork needs a change before it is a new design, and a design needs a title. */}
            {result.prompt !== undefined && (
              <>
                <input
                  className="input title-input"
                  aria-label="Title"
                  placeholder="Title"
                  value={result.prompt}
                  onChange={(e) =>
                    setResult({ ...result, prompt: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={publish}
                  disabled={
                    working || invalid.length > 0 || !result.prompt.trim()
                  }
                >
                  {editing ? "Save" : "Publish"}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setResult(null);
                setForkedFrom("");
                setEditing("");
                setInvalid([]);
                setSelected(null);
              }}
              disabled={working}
            >
              Start over
            </button>
          </div>
        )}
      </form>

      {designing && !result && <Designing />}
      {error && <p role="alert">{error}</p>}
      {problems.length > 0 && (
        <ul>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {invalid.length > 0 && (
        <div role="alert">
          <p>
            This can't be built as it is. Move the parts marked in red, or
            refine it.
          </p>
          <ul>
            {invalid.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        </div>
      )}

      {result && catalogueError && <p role="alert">{catalogueError}</p>}
      {result && catalogue && (
        <p className="text-muted">
          Tap a part to change its colour, or press and hold it to drag it
          somewhere else.
        </p>
      )}
      {result && catalogue && (
        <div className="design-grid">
          <div className="preview-frame">
            <Suspense
              fallback={
                <div className="blueprint text-muted center-note">
                  Loading preview…
                </div>
              }
            >
              <Preview
                layout={result.layout}
                catalogue={catalogue}
                marks={marks}
                onDrop={working ? undefined : place}
                onSelect={setSelected}
              />
            </Suspense>
            {finishes.length > 1 && (
              <div
                className="finish-picker"
                role="group"
                aria-label={`Colour of ${finishes[0].name}`}
              >
                {finishes.map((p) => (
                  <button
                    key={p.article}
                    type="button"
                    className="swatch"
                    style={{ background: finishColour(p.finish) }}
                    title={p.finish}
                    aria-label={p.finish}
                    aria-pressed={p.article === tapped?.article}
                    disabled={working}
                    onClick={() => recolour(p.article)}
                  />
                ))}
              </div>
            )}
            {designing && (
              <div className="preview-veil">
                <span className="swirl" aria-hidden="true" />
                <Designing />
              </div>
            )}
          </div>
          <PartsList
            layout={result.layout}
            catalogue={catalogue}
            notes={result.notes}
          />
        </div>
      )}
    </div>
  );
}

/** The status shown while a prompt is with the model, its ellipsis animated in CSS. */
function Designing() {
  return (
    <p role="status" className="text-muted designing">
      Designing
      <span className="ellipsis" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </p>
  );
}
