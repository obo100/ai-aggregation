import { useEffect, useMemo, useState } from "react";
import { ConfigProvider, theme } from "antd";
import { MainApp } from "./main/MainApp";
import { QuickPanel } from "./quick/QuickPanel";

function usePrefersDark(): boolean {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setIsDark(media.matches);

    update();

    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return isDark;
}

export function App() {
  const isQuick = window.location.hash.startsWith("#/quick");
  const prefersDark = usePrefersDark();

  useEffect(() => {
    document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
  }, [prefersDark]);

  const antdTheme = useMemo(
    () => ({
      algorithm: prefersDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    }),
    [prefersDark]
  );

  return (
    <ConfigProvider theme={antdTheme}>
      {isQuick ? <QuickPanel /> : <MainApp />}
    </ConfigProvider>
  );
}
