import { redirect } from "next/navigation";

export default function LegacyAdminAssignmentsPage(): never {
  redirect("/admin/users");
}
