import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface DialogElement {
  display_name: string;
  name: string;
  type: "text" | "textarea" | "select" | "bool" | "radio";
  subtype?: "email" | "number" | "password" | "tel" | "url" | "text";
  optional?: boolean;
  help_text?: string;
  default?: string;
  placeholder?: string;
  min_length?: number;
  max_length?: number;
  options?: Array<{ text: string; value: string }>;
  data_source?: string;
}

export interface InteractiveDialog {
  callback_id?: string;
  title: string;
  introduction_text?: string;
  elements: DialogElement[];
  submit_label?: string;
  icon_url?: string;
  notify_on_cancel?: boolean;
  state?: string;
}

export interface InteractiveDialogModalProps {
  serverId: string;
  triggerId: string;
  url: string;
  dialog: InteractiveDialog;
  onClose: () => void;
}

export function InteractiveDialogModal({
  serverId,
  triggerId: _triggerId,
  url,
  dialog,
  onClose,
}: InteractiveDialogModalProps) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const el of (dialog.elements ?? [])) {
      if (el.type === "bool") {
        initial[el.name] = el.default === "true";
      } else {
        initial[el.name] = el.default ?? "";
      }
    }
    return initial;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [genericError, setGenericError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") handleCancel();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  function handleCancel() {
    if (dialog.notify_on_cancel) {
      invoke("submit_dialog", {
        serverId,
        url,
        submission: {
          type: "dialog_submission",
          callback_id: dialog.callback_id ?? "",
          state: dialog.state ?? "",
          cancelled: true,
          submission: {},
        },
      }).catch(() => {});
    }
    onClose();
  }

  async function handleSubmit() {
    // Client-side validation
    const errors: Record<string, string> = {};
    for (const el of (dialog.elements ?? [])) {
      if (!el.optional) {
        const val = values[el.name];
        if (el.type === "bool") {
          // booleans are always valid
        } else if (!val || String(val).trim() === "") {
          errors[el.name] = `${el.display_name} is required`;
        }
      }
      if (el.type === "text" || el.type === "textarea") {
        const val = String(values[el.name] ?? "");
        if (el.min_length && val.length < el.min_length) {
          errors[el.name] = `Minimum length is ${el.min_length}`;
        }
        if (el.max_length && val.length > el.max_length) {
          errors[el.name] = `Maximum length is ${el.max_length}`;
        }
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setGenericError(null);

    const submission: Record<string, string | boolean> = {};
    for (const el of (dialog.elements ?? [])) {
      submission[el.name] = values[el.name] ?? (el.type === "bool" ? false : "");
    }

    try {
      const result = await invoke<Record<string, unknown>>("submit_dialog", {
        serverId,
        url,
        submission: {
          type: "dialog_submission",
          callback_id: dialog.callback_id ?? "",
          state: dialog.state ?? "",
          cancelled: false,
          submission,
        },
      });

      if (result && typeof result === "object") {
        if (result.errors && typeof result.errors === "object") {
          setFieldErrors(result.errors as Record<string, string>);
          setSubmitting(false);
          return;
        }
        if (result.error && typeof result.error === "string") {
          setGenericError(result.error);
          setSubmitting(false);
          return;
        }
      }

      onClose();
    } catch (err) {
      setGenericError(String(err));
      setSubmitting(false);
    }
  }

  function setValue(name: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div
        className="modal-content interactive-dialog-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          {dialog.icon_url && (
            <img src={dialog.icon_url} alt="" className="dialog-icon" />
          )}
          <h2>{dialog.title}</h2>
          <button className="modal-close" onClick={handleCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="dialog-body">
          {dialog.introduction_text && (
            <p className="dialog-intro">{dialog.introduction_text}</p>
          )}

          {genericError && (
            <div className="dialog-generic-error">{genericError}</div>
          )}

          {(dialog.elements ?? []).map((el) => (
            <div key={el.name} className={`dialog-field${fieldErrors[el.name] ? " has-error" : ""}`}>
              <label className="dialog-field-label">
                {el.display_name}
                {!el.optional && <span className="dialog-required">*</span>}
              </label>

              {el.type === "text" && (
                <input
                  type={el.subtype || "text"}
                  className="dialog-input"
                  value={String(values[el.name] ?? "")}
                  onChange={(e) => setValue(el.name, e.target.value)}
                  placeholder={el.placeholder}
                  minLength={el.min_length}
                  maxLength={el.max_length}
                />
              )}

              {el.type === "textarea" && (
                <textarea
                  className="dialog-textarea"
                  value={String(values[el.name] ?? "")}
                  onChange={(e) => setValue(el.name, e.target.value)}
                  placeholder={el.placeholder}
                  maxLength={el.max_length}
                  rows={4}
                />
              )}

              {el.type === "select" && (
                <select
                  className="dialog-select"
                  value={String(values[el.name] ?? "")}
                  onChange={(e) => setValue(el.name, e.target.value)}
                >
                  {!el.default && <option value="">Select an option</option>}
                  {(el.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.text}
                    </option>
                  ))}
                </select>
              )}

              {el.type === "bool" && (
                <label className="dialog-checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(values[el.name])}
                    onChange={(e) => setValue(el.name, e.target.checked)}
                  />
                  <span>{el.placeholder || el.display_name}</span>
                </label>
              )}

              {el.type === "radio" && (
                <div className="dialog-radio-group">
                  {(el.options ?? []).map((opt) => (
                    <label key={opt.value} className="dialog-radio-label">
                      <input
                        type="radio"
                        name={el.name}
                        value={opt.value}
                        checked={values[el.name] === opt.value}
                        onChange={() => setValue(el.name, opt.value)}
                      />
                      <span>{opt.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {fieldErrors[el.name] && (
                <span className="dialog-field-error">{fieldErrors[el.name]}</span>
              )}

              {el.help_text && !fieldErrors[el.name] && (
                <span className="dialog-help-text">{el.help_text}</span>
              )}
            </div>
          ))}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={handleCancel} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : (dialog.submit_label || "Submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
