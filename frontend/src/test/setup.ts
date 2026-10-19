import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "../i18n";

// بلا globals لا ينظّف Testing Library الصفحة تلقائياً: كل اختبار كان يرسم فوق بقايا سابقه
afterEach(cleanup);

// jsdom لا ينفّذ التمرير؛ المحادثة تمرّر إلى آخر رسالة عند كل رسالة جديدة
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
