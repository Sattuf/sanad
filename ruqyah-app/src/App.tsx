import { useEffect } from "react";
import { SvgDefs } from "./components/ornaments";
import { TabBar } from "./components/TabBar";
import { useRoute } from "./lib/router";
import { Account } from "./screens/Account";
import { GroupKhatmaScreen, JoinKhatma } from "./screens/GroupKhatma";
import { Khatma } from "./screens/Khatma";
import { PlanDone } from "./screens/PlanDone";
import { PlanDetail, Plans } from "./screens/Plans";
import { Reader } from "./screens/Reader";
import { Support } from "./screens/Support";
import { Today } from "./screens/Today";
import { useStore } from "./state/store";

export function App() {
  const route = useRoute();
  const theme = useStore((s) => s.settings.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <>
      <SvgDefs />
      <div className="frame">
        <div className="shell">
          {route.name === "today" && <Today />}
          {route.name === "plans" && <Plans />}
          {route.name === "plan" && <PlanDetail id={route.id} />}
          {route.name === "reader" && <Reader />}
          {route.name === "khatma" && <Khatma />}
          {route.name === "support" && <Support />}
          {route.name === "planDone" && <PlanDone />}
          {route.name === "account" && <Account />}
          {route.name === "group" && <GroupKhatmaScreen key={route.id} id={route.id} />}
          {route.name === "join" && <JoinKhatma key={route.code} code={route.code} />}
        </div>
        <aside className="hashiya-col" aria-label="الحاشية">
          <h4>سند</h4>
          <p>رفيق يومي مجاني يساعدك أن ترقي نفسك بنفسك. لا يحكم على حالك ولا يعدك بنتيجة، والشفاء من الله.</p>
          <h4>بياناتك</h4>
          <p>تقدّمك محفوظ على جهازك. الحساب اختياري للمزامنة والختمة مع أسرتك، ولا تتبّع ولا إعلانات.</p>
        </aside>
      </div>
      <TabBar current={route.name} />
    </>
  );
}
