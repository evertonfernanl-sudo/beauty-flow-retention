import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, Instagram, Facebook, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ReactNode } from "react";
import { CookieConsent } from "@/components/CookieConsent";


export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          BeautyFlow
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link to="/funcionalidades" className="hover:text-foreground transition-colors">Funcionalidades</Link>
          <Link to="/planos" className="hover:text-foreground transition-colors">Planos</Link>
          <Link to="/blog" className="hover:text-foreground transition-colors">Blog</Link>
          <Link to="/contato" className="hover:text-foreground transition-colors">Contato</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth" className="hidden sm:block">
            <Button variant="ghost" size="sm">Entrar</Button>
          </Link>
          <Link to="/auth">
            <Button size="sm" className="shadow-soft">
              Teste grátis
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary/30">
      <div className="mx-auto max-w-6xl px-6 py-12 grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            BeautyFlow
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Recupere clientes e aumente seu faturamento.
          </p>
          <div className="mt-4 flex gap-2 text-muted-foreground">
            <a href="#" aria-label="Instagram" className="hover:text-foreground"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="Facebook" className="hover:text-foreground"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="Email" className="hover:text-foreground"><Mail className="h-4 w-4" /></a>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Produto</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/funcionalidades" className="hover:text-foreground">Funcionalidades</Link></li>
            <li><Link to="/planos" className="hover:text-foreground">Planos</Link></li>
            <li><Link to="/auth" className="hover:text-foreground">Login</Link></li>
            <li><Link to="/auth" className="hover:text-foreground">Cadastro</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Conteúdo</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/blog" className="hover:text-foreground">Blog</Link></li>
            <li><Link to="/contato" className="hover:text-foreground">Contato</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Legal</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><a href="#" className="hover:text-foreground">Política de Privacidade</a></li>
            <li><a href="#" className="hover:text-foreground">Termos de Uso</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} BeautyFlow. Todos os direitos reservados.
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
