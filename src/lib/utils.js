export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const iso = () => new Date().toISOString();

export const $$ = (n) => "$" + Math.round(n || 0).toLocaleString();

export const sd = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

export const da = (d) =>
  d
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
      )
    : 0;

export const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
