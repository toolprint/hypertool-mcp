import { ReactElement, ReactNode, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { ThemeProvider } from "@/providers/theme-provider";

type RouterOptions = {
  initialEntries?: string[];
};

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  router?: RouterOptions;
}

interface ProvidersProps {
  children: ReactNode;
  initialEntries?: string[];
}

function Providers({ children, initialEntries = ["/"] }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <ThemeProvider defaultTheme="light" storageKey="hypertool-theme-test">
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function customRender(ui: ReactElement, options?: CustomRenderOptions) {
  const { router, ...renderOptions } = options ?? {};

  return render(ui, {
    wrapper: ({ children }) => (
      <Providers initialEntries={router?.initialEntries}>{children}</Providers>
    ),
    ...renderOptions
  });
}

export * from "@testing-library/react";
export { customRender as render };
