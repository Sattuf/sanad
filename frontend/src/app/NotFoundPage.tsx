import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <EmptyState title="الصفحة غير موجودة">
      <Link to="/" className="text-primary underline">العودة للرئيسية</Link>
    </EmptyState>
  );
}
