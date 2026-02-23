import React from "react";
import {
  Accordion,
  Badge,
  Callout,
  Card as MintCard,
  Check,
  CodeBlock,
  CodeGroup,
  Color,
  Columns,
  Danger,
  Expandable,
  Frame,
  Icon,
  Info,
  Note,
  Panel,
  Property,
  Steps,
  Tabs,
  Tile,
  Tip,
  Tooltip,
  Tree,
  Update,
  View,
  Warning
} from "@mintlify/components";
import ApiPlayground from "./ApiPlayground";

type PropsWithChildren = React.PropsWithChildren<Record<string, unknown>>;

function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "required";
}

function Wrapper(props: PropsWithChildren) {
  return <div>{props.children}</div>;
}

function Alert(props: PropsWithChildren) {
  return <Callout>{props.children}</Callout>;
}

function AlertTitle(props: PropsWithChildren) {
  return <p className="m-0 font-semibold">{props.children}</p>;
}

function AlertDescription(props: PropsWithChildren) {
  return <div className="mt-2">{props.children}</div>;
}

function ParamField(props: PropsWithChildren) {
  const body = typeof props.body === "string" ? props.body : undefined;
  const required = toBoolean(props.required);
  const type = typeof props.type === "string" ? props.type : undefined;
  const header = typeof props.path === "string" ? props.path : typeof props.query === "string" ? props.query : "param";

  return (
    <section className="rounded-2xl border border-stone-200 px-4 py-3 my-3">
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-lg text-stone-800">{header}</code>
        {type ? <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{type}</span> : null}
        {required ? <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs text-rose-700">required</span> : null}
      </div>
      {body ? <p className="mt-2 mb-0 text-stone-600">{body}</p> : <div className="mt-2 text-stone-600">{props.children}</div>}
    </section>
  );
}

function ResponseField(props: PropsWithChildren) {
  const status = typeof props.status === "string" ? props.status : undefined;
  const type = typeof props.type === "string" ? props.type : undefined;
  const header = typeof props.name === "string" ? props.name : "response";

  return (
    <section className="rounded-2xl border border-stone-200 px-4 py-3 my-3">
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-lg text-stone-800">{header}</code>
        {type ? <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{type}</span> : null}
        {status ? <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{status}</span> : null}
      </div>
      <div className="mt-2 text-stone-600">{props.children}</div>
    </section>
  );
}

function Table(props: PropsWithChildren) {
  return (
    <div className="my-5 overflow-x-auto">
      <table>{props.children}</table>
    </div>
  );
}

function normalizeMermaidChart(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function extractMermaidChart(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => extractMermaidChart(entry)).join("");
  }

  if (value && typeof value === "object") {
    const asRecord = value as Record<string, unknown>;
    if ("children" in asRecord) {
      return extractMermaidChart(asRecord.children);
    }
  }

  return "";
}

function Mermaid(props: PropsWithChildren) {
  const rawChart = extractMermaidChart(props.chart) || extractMermaidChart(props.children);
  const chart = normalizeMermaidChart(rawChart);
  return <div className="mermaid group relative overflow-hidden">{chart}</div>;
}

export const components = {
  Accordion,
  AccordionGroup: Accordion.Group,
  Alert,
  AlertDescription,
  AlertTitle,
  ApiPlayground,
  Badge,
  Callout,
  Card: MintCard,
  CardGroup: Columns,
  Cards: Columns,
  Check,
  CodeBlock,
  CodeGroup,
  Color,
  Column: Wrapper,
  Columns,
  CustomCode: Wrapper,
  CustomComponent: Wrapper,
  Danger,
  DynamicCustomComponent: Wrapper,
  Expandable,
  Frame,
  Heading: Wrapper,
  Icon,
  Info,
  Latex: Wrapper,
  Link: Wrapper,
  Loom: Wrapper,
  MDXContentController: Wrapper,
  Mermaid,
  Note,
  Panel,
  Param: Wrapper,
  ParamField,
  PreviewButton: Wrapper,
  Property,
  RequestExample: Wrapper,
  ResponseExample: Wrapper,
  ResponseField,
  Snippet: Wrapper,
  SnippetGroup: Wrapper,
  Steps,
  Table,
  Tabs,
  Tile,
  Tip,
  Tooltip,
  Tree,
  Update,
  View,
  Warning
};

export function useMDXComponents() {
  return {
    ...components,
    Step: Steps.Item,
    Tab: Tabs.Item
  };
}
