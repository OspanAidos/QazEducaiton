import { Button } from "../components/ui.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";

export default function NotFound() {
  return (
    <>
      <PageHead
        label="страница не найдена"
        title="404."
        lead="Такой страницы нет. Возможно, адрес изменился или в ссылке опечатка."
      />
      <Section>
        <Button to="/" size="lg">
          На главную
        </Button>
      </Section>
    </>
  );
}
