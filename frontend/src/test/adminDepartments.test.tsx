import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import AdminDepartments from "../pages/admin/AdminDepartments";
import { membersApi, MemberRecord, EligibleUser } from "../services/complaintsApi";
import { adminApi, AdminUserRecord } from "../services/adminApi";

vi.mock("../services/complaintsApi", () => ({
  membersApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    listEligibleUsers: vi.fn(),
  },
}));

vi.mock("../services/adminApi", () => ({
  adminApi: {
    listUsers: vi.fn(),
  },
}));

const mockMembers: MemberRecord[] = [
  {
    id: "69e08221f55981d3faedf6d5",
    name: "Officer Priya",
    department: "Road & Infrastructure",
    userId: {
      id: "6ae19e3e0febcd3d2bd50545",
      name: "Road Infrastructure Demo Officer",
      email: "road.demo@govai.gov",
      department: "Road & Infrastructure",
      departmentRole: "officer",
      role: "department",
      status: "active",
    },
  },
  {
    id: "69e08223f55981d3faedf6db",
    name: "Officer Amit",
    department: "Electricity",
    userId: {
      id: "6ae19e3e0febcd3d2bd5054b",
      name: "Electricity Demo Officer",
      email: "electricity.demo@govai.gov",
      department: "Electricity",
      departmentRole: "officer",
      role: "department",
      status: "active",
    },
  },
  {
    id: "69e08222f55981d3faedf6d8",
    name: "Officer Rajesh",
    department: "Water Supply",
    userId: null,
  },
  {
    id: "69e08223f55981d3faedf6de",
    name: "Officer Neha",
    department: "Environment",
    userId: null,
  },
];

const mockUsers: AdminUserRecord[] = [
  // Authorities
  {
    id: "69e08213f55981d3faedf6c5",
    name: "Priya Nair",
    email: "authority@demo.com",
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "authority",
    status: "active",
    complaintsCount: 0,
  },
  {
    id: "69e08219f55981d3faedf6cb",
    name: "Meera Singh",
    email: "water@demo.com",
    role: "department",
    department: "Water Supply",
    departmentRole: "authority",
    status: "active",
    complaintsCount: 0,
  },
  {
    id: "69e0821cf55981d3faedf6ce",
    name: "Amit Verma",
    email: "electricity@demo.com",
    role: "department",
    department: "Electricity",
    departmentRole: "authority",
    status: "active",
    complaintsCount: 0,
  },
  {
    id: "69e0821ff55981d3faedf6d1",
    name: "Neha Patel",
    email: "environment@demo.com",
    role: "department",
    department: "Environment",
    departmentRole: "authority",
    status: "active",
    complaintsCount: 0,
  },
  // Officers
  {
    id: "6ae19e3e0febcd3d2bd50545",
    name: "Road Infrastructure Demo Officer",
    email: "road.demo@govai.gov",
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
    status: "active",
    complaintsCount: 2,
    isOfficer: true,
    memberLinked: true,
  },
  {
    id: "6ae19e3e0febcd3d2bd50548",
    name: "Water Supply Demo Officer",
    email: "water.demo@govai.gov",
    role: "department",
    department: "Water Supply",
    departmentRole: "officer",
    status: "active",
    complaintsCount: 0,
    isOfficer: true,
    memberLinked: false,
  },
  {
    id: "6ae19e3e0febcd3d2bd5054b",
    name: "Electricity Demo Officer",
    email: "electricity.demo@govai.gov",
    role: "department",
    department: "Electricity",
    departmentRole: "officer",
    status: "active",
    complaintsCount: 1,
    isOfficer: true,
    memberLinked: true,
  },
  {
    id: "6ae19e3e0febcd3d2bd5054e",
    name: "Environment Demo Officer",
    email: "environment.demo@govai.gov",
    role: "department",
    department: "Environment",
    departmentRole: "officer",
    status: "active",
    complaintsCount: 0,
    isOfficer: true,
    memberLinked: false,
  },
];

describe("Admin Department & Officer Management Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(membersApi.list).mockResolvedValue(mockMembers);
    vi.mocked(adminApi.listUsers).mockResolvedValue(mockUsers);
  });

  it("renders page header and all four municipal department overviews", async () => {
    render(
      <MemoryRouter>
        <AdminDepartments />
      </MemoryRouter>
    );

    expect(screen.getByText("Department & Officer Management")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Municipal Department Overviews")).toBeDefined();
    });

    // Check all 4 departments are displayed in overview
    expect(screen.getByTestId("department-card-road-&-infrastructure")).toBeDefined();
    expect(screen.getByTestId("department-card-water-supply")).toBeDefined();
    expect(screen.getByTestId("department-card-electricity")).toBeDefined();
    expect(screen.getByTestId("department-card-environment")).toBeDefined();

    // Check assigned authority names
    expect(screen.getByText("Priya Nair")).toBeDefined();
    expect(screen.getByText("authority@demo.com")).toBeDefined();
    expect(screen.getByText("Meera Singh")).toBeDefined();
    expect(screen.getByText("Amit Verma")).toBeDefined();
    expect(screen.getByText("Neha Patel")).toBeDefined();
  });

  it("renders the officer and member roster with accurate mapping status badges", async () => {
    render(
      <MemoryRouter>
        <AdminDepartments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Officer Priya")).toBeDefined();
      expect(screen.getByText("Officer Amit")).toBeDefined();
      expect(screen.getByText("Officer Rajesh")).toBeDefined();
      expect(screen.getByText("Officer Neha")).toBeDefined();
    });

    // Priya is linked
    const priyaRow = screen.getByTestId("member-row-officer-priya");
    expect(priyaRow.textContent).toContain("Linked");
    expect(priyaRow.textContent).toContain("Road Infrastructure Demo Officer");
    expect(priyaRow.textContent).toContain("road.demo@govai.gov");

    // Amit is linked
    const amitRow = screen.getByTestId("member-row-officer-amit");
    expect(amitRow.textContent).toContain("Linked");
    expect(amitRow.textContent).toContain("Electricity Demo Officer");
    expect(amitRow.textContent).toContain("electricity.demo@govai.gov");

    // Rajesh is unlinked
    const rajeshRow = screen.getByTestId("member-row-officer-rajesh");
    expect(rajeshRow.textContent).toContain("Unlinked");
    expect(rajeshRow.textContent).toContain("No account linked");

    // Neha is unlinked
    const nehaRow = screen.getByTestId("member-row-officer-neha");
    expect(nehaRow.textContent).toContain("Unlinked");
    expect(nehaRow.textContent).toContain("No account linked");
  });

  it("filters roster by department selection", async () => {
    render(
      <MemoryRouter>
        <AdminDepartments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Officer Priya")).toBeDefined();
    });

    const deptSelect = screen.getByTestId("department-filter-select");
    fireEvent.change(deptSelect, { target: { value: "Water Supply" } });

    // Only Officer Rajesh should be shown
    expect(screen.getByText("Officer Rajesh")).toBeDefined();
    expect(screen.queryByText("Officer Priya")).toBeNull();
    expect(screen.queryByText("Officer Amit")).toBeNull();
    expect(screen.queryByText("Officer Neha")).toBeNull();
  });

  it("filters roster by mapping status (Linked Only vs Unlinked Only)", async () => {
    render(
      <MemoryRouter>
        <AdminDepartments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Officer Priya")).toBeDefined();
    });

    const mappingSelect = screen.getByTestId("mapping-filter-select");

    // Filter to Linked Only
    fireEvent.change(mappingSelect, { target: { value: "linked" } });
    expect(screen.getByText("Officer Priya")).toBeDefined();
    expect(screen.getByText("Officer Amit")).toBeDefined();
    expect(screen.queryByText("Officer Rajesh")).toBeNull();
    expect(screen.queryByText("Officer Neha")).toBeNull();

    // Filter to Unlinked Only
    fireEvent.change(mappingSelect, { target: { value: "unlinked" } });
    expect(screen.getByText("Officer Rajesh")).toBeDefined();
    expect(screen.getByText("Officer Neha")).toBeDefined();
    expect(screen.queryByText("Officer Priya")).toBeNull();
    expect(screen.queryByText("Officer Amit")).toBeNull();
  });

  it("filters roster by search query", async () => {
    render(
      <MemoryRouter>
        <AdminDepartments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Officer Priya")).toBeDefined();
    });

    const searchInput = screen.getByTestId("department-roster-search");

    // Search by member name
    fireEvent.change(searchInput, { target: { value: "rajesh" } });
    expect(screen.getByText("Officer Rajesh")).toBeDefined();
    expect(screen.queryByText("Officer Priya")).toBeNull();

    // Search by linked officer email
    fireEvent.change(searchInput, { target: { value: "road.demo" } });
    expect(screen.getByText("Officer Priya")).toBeDefined();
    expect(screen.queryByText("Officer Rajesh")).toBeNull();
  });

  it("opens read-only member details dialog with complete inspection data", async () => {
    render(
      <MemoryRouter>
        <AdminDepartments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Officer Priya")).toBeDefined();
    });

    // Inspect linked member
    const inspectPriya = screen.getByTestId("inspect-member-officer-priya");
    fireEvent.click(inspectPriya);

    await waitFor(() => {
      expect(screen.getByTestId("member-details-dialog")).toBeDefined();
    });

    const dialog = screen.getByTestId("member-details-dialog");
    expect(within(dialog).getByText("Member Profile Details")).toBeDefined();
    expect(within(dialog).getByText("69e08221f55981d3faedf6d5")).toBeDefined(); // Member ID
    expect(within(dialog).getByText("Road Infrastructure Demo Officer")).toBeDefined();
    expect(within(dialog).getByText("road.demo@govai.gov")).toBeDefined();
    expect(within(dialog).getByText("Linked Officer")).toBeDefined();

    // Close modal
    const closeBtn = screen.getByTestId("close-member-details-dialog");
    fireEvent.click(closeBtn);

    // Inspect unlinked member
    await waitFor(() => {
      expect(screen.getByTestId("inspect-member-officer-rajesh")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("inspect-member-officer-rajesh"));

    await waitFor(() => {
      expect(screen.getByText("Unlinked Member Profile")).toBeDefined();
    });
    expect(screen.getByText(/This Member record has not been linked to an active department officer account/i)).toBeDefined();
  });

  it("opens link officer dialog, lists eligible officers, and links officer successfully", async () => {
    const mockEligibleWaterOfficers: EligibleUser[] = [
      {
        id: "6ae19e3e0febcd3d2bd50548",
        name: "Water Supply Demo Officer",
        email: "water.demo@govai.gov",
        department: "Water Supply",
        status: "active",
        isLinked: false,
        linkedMember: null,
      },
    ];

    vi.mocked(membersApi.listEligibleUsers).mockResolvedValue(mockEligibleWaterOfficers);
    vi.mocked(membersApi.update).mockResolvedValue({
      id: "69e08222f55981d3faedf6d8",
      name: "Officer Rajesh",
      department: "Water Supply",
      userId: {
        id: "6ae19e3e0febcd3d2bd50548",
        name: "Water Supply Demo Officer",
        email: "water.demo@govai.gov",
        department: "Water Supply",
        departmentRole: "officer",
        role: "department",
        status: "active",
      },
    });

    render(
      <MemoryRouter>
        <AdminDepartments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("link-officer-officer-rajesh")).toBeDefined();
    });

    // Click "Link Officer" on Officer Rajesh
    fireEvent.click(screen.getByTestId("link-officer-officer-rajesh"));

    await waitFor(() => {
      expect(screen.getByTestId("link-officer-dialog")).toBeDefined();
    });

    expect(membersApi.listEligibleUsers).toHaveBeenCalledWith("Water Supply");

    // Verify eligible officer is shown
    await waitFor(() => {
      expect(screen.getByTestId("eligible-officer-6ae19e3e0febcd3d2bd50548")).toBeDefined();
    });
    expect(screen.getByText("water.demo@govai.gov")).toBeDefined();

    // Select eligible officer
    fireEvent.click(screen.getByTestId("eligible-officer-6ae19e3e0febcd3d2bd50548"));

    // Confirm linking
    const confirmBtn = screen.getByTestId("confirm-link-officer-btn");
    expect(confirmBtn).toBeDefined();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(membersApi.update).toHaveBeenCalledWith("69e08222f55981d3faedf6d8", {
        userId: "6ae19e3e0febcd3d2bd50548",
      });
    });
  });

  it("opens unlink confirmation dialog and unlinks officer successfully", async () => {
    vi.mocked(membersApi.update).mockResolvedValue({
      id: "69e08221f55981d3faedf6d5",
      name: "Officer Priya",
      department: "Road & Infrastructure",
      userId: null,
    });

    render(
      <MemoryRouter>
        <AdminDepartments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("unlink-officer-officer-priya")).toBeDefined();
    });

    // Click "Unlink" on Officer Priya
    fireEvent.click(screen.getByTestId("unlink-officer-officer-priya"));

    await waitFor(() => {
      expect(screen.getByTestId("unlink-confirmation-dialog")).toBeDefined();
    });

    const dialog = screen.getByTestId("unlink-confirmation-dialog");
    expect(within(dialog).getByText("Road Infrastructure Demo Officer")).toBeDefined();
    expect(within(dialog).getByText(/road\.demo@govai\.gov/i)).toBeDefined();

    // Confirm unlinking
    const confirmBtn = screen.getByTestId("confirm-unlink-officer-btn");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(membersApi.update).toHaveBeenCalledWith("69e08221f55981d3faedf6d5", {
        unlinkUser: true,
      });
    });
  });

  it("opens create member dialog and creates a new department member", async () => {
    const mockEligibleRoadOfficers: EligibleUser[] = [];
    vi.mocked(membersApi.listEligibleUsers).mockResolvedValue(mockEligibleRoadOfficers);
    vi.mocked(membersApi.create).mockResolvedValue({
      id: "69e08224f55981d3faedf6f0",
      name: "Officer Vikram",
      department: "Road & Infrastructure",
      userId: null,
    });

    render(
      <MemoryRouter>
        <AdminDepartments />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("create-member-btn")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("create-member-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("create-member-dialog")).toBeDefined();
    });

    // Fill in member name
    const nameInput = screen.getByTestId("new-member-name-input");
    fireEvent.change(nameInput, { target: { value: "Officer Vikram" } });

    // Submit creation
    const submitBtn = screen.getByTestId("submit-create-member-btn");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(membersApi.create).toHaveBeenCalledWith(
        "Officer Vikram",
        null,
        "Road & Infrastructure"
      );
    });
  });
});
