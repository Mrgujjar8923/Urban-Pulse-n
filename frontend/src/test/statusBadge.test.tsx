import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { PriorityBadge, StatusBadge } from "@/components/shared/StatusBadge";

describe("PriorityBadge Component", () => {
  it("renders 'Low' priority correctly for lowercase 'low'", () => {
    const { container } = render(<PriorityBadge priority="low" />);
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-muted", "text-muted-foreground");
  });

  it("renders 'Low' priority correctly for title-case 'Low'", () => {
    const { container } = render(<PriorityBadge priority="Low" />);
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-muted", "text-muted-foreground");
  });

  it("renders 'Medium' priority correctly for lowercase 'medium'", () => {
    const { container } = render(<PriorityBadge priority="medium" />);
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-info/10", "text-info");
  });

  it("renders 'Medium' priority correctly for title-case 'Medium'", () => {
    const { container } = render(<PriorityBadge priority="Medium" />);
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-info/10", "text-info");
  });

  it("renders 'High' priority correctly for lowercase 'high'", () => {
    const { container } = render(<PriorityBadge priority="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-warning/10", "text-warning");
  });

  it("renders 'High' priority correctly for title-case 'High'", () => {
    const { container } = render(<PriorityBadge priority="High" />);
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-warning/10", "text-warning");
  });

  it("renders 'Critical' priority correctly for lowercase 'critical'", () => {
    const { container } = render(<PriorityBadge priority="critical" />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-destructive/10", "text-destructive");
  });

  it("renders 'Critical' priority correctly for title-case 'Critical'", () => {
    const { container } = render(<PriorityBadge priority="Critical" />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-destructive/10", "text-destructive");
  });

  it("safely falls back to 'Low' for undefined, null, or empty string", () => {
    const { unmount: u1 } = render(<PriorityBadge />);
    expect(screen.getByText("Low")).toBeInTheDocument();
    u1();

    const { unmount: u2 } = render(<PriorityBadge priority={null} />);
    expect(screen.getByText("Low")).toBeInTheDocument();
    u2();

    render(<PriorityBadge priority="" />);
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("safely falls back to 'Low' for unknown priority values", () => {
    render(<PriorityBadge priority="urgent_unsupported" />);
    expect(screen.getByText("Low")).toBeInTheDocument();
  });
});

describe("StatusBadge Component", () => {
  it("renders known status labels correctly", () => {
    const { unmount: u1 } = render(<StatusBadge status="Resolved" />);
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    u1();

    const { unmount: u2 } = render(<StatusBadge status="In Progress" />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    u2();

    render(<StatusBadge status="Assigned" />);
    expect(screen.getByText("Assigned")).toBeInTheDocument();
  });
});
