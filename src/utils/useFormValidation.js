import { useCallback, useRef, useState } from 'react';
import { validateAllFields } from './formRules';

// One validation behaviour for every form:
//  * nothing is shown before the user leaves a field (blur) or submits;
//  * after that, the field is re-checked on every change, so the message disappears as soon as it is fixed;
//  * on submit every field is checked, the first invalid one is focused and scrolled into view, and nothing is sent.
// Usage: const v = useFormValidation({ email: rules.email, ... });
//   <InputField {...v.field('email', values)} value=… onChange=… />   and   if (!v.validateAll(values)) return;
export function useFormValidation(ruleMap) {
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const refs = useRef({});
  const rulesRef = useRef(ruleMap);
  rulesRef.current = ruleMap;

  const check = useCallback((name, values) => {
    const rule = rulesRef.current[name];
    const msg = rule ? rule(values[name], values) : null;
    setErrors((e) => (e[name] === msg ? e : { ...e, [name]: msg }));
    return msg;
  }, []);

  // call from onChange with the NEW values: re-validates only fields the user has already touched
  const changed = useCallback((name, values) => {
    setTouched((t) => {
      if (t[name]) check(name, values);
      return t;
    });
  }, [check]);

  const blurred = useCallback((name, values) => {
    setTouched((t) => (t[name] ? t : { ...t, [name]: true }));
    check(name, values);
  }, [check]);

  const validateAll = useCallback((values) => {
    const found = validateAllFields(rulesRef.current, values);
    const all = Object.fromEntries(Object.keys(rulesRef.current).map((k) => [k, found[k] || null]));
    setErrors(all);
    setTouched(Object.fromEntries(Object.keys(rulesRef.current).map((k) => [k, true])));
    const first = Object.keys(rulesRef.current).find((k) => found[k]);
    if (first) {
      const el = refs.current[first];
      if (el) {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* old WebView */ }
        if (typeof el.focus === 'function') el.focus({ preventScroll: true });
      }
      return false;
    }
    return true;
  }, []);

  const errorFor = (name) => (touched[name] ? errors[name] || null : null);
  const setFieldError = (name, msg) => {
    setErrors((e) => ({ ...e, [name]: msg }));
    setTouched((t) => ({ ...t, [name]: true }));
  };
  const reset = () => { setErrors({}); setTouched({}); };
  // props for InputField / custom controls
  const field = (name, values) => ({
    name,
    error: errorFor(name),
    inputRef: (el) => { refs.current[name] = el; },
    onBlur: () => blurred(name, values),
  });
  const refFor = (name) => (el) => { refs.current[name] = el; };

  return { errorFor, field, refFor, changed, blurred, validateAll, setFieldError, reset };
}
