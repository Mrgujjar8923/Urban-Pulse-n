import { ComplaintRecord } from "@/services/complaintsApi";

export const DEPARTMENT_COMPLAINT_FILTERS = [
  "All",
  "Pending",
  "Assigned",
  "In Progress",
  "Resolved",
  "Overdue",
] as const;

export type DepartmentComplaintFilter = (typeof DEPARTMENT_COMPLAINT_FILTERS)[number];

export const isComplaintOverdue = (complaint: ComplaintRecord) => (
  complaint.status !== "Resolved" && complaint.sla?.isOverdue === true
);

export const matchesDepartmentComplaintFilter = (
  complaint: ComplaintRecord,
  filter: DepartmentComplaintFilter
) => {
  if (filter === "All") return true;
  if (filter === "Overdue") return isComplaintOverdue(complaint);
  return complaint.status === filter;
};

export const filterDepartmentComplaints = (
  complaints: ComplaintRecord[],
  filter: DepartmentComplaintFilter
) => complaints.filter((complaint) => matchesDepartmentComplaintFilter(complaint, filter));

export const countDepartmentComplaints = (
  complaints: ComplaintRecord[],
  filter: DepartmentComplaintFilter
) => filterDepartmentComplaints(complaints, filter).length;
