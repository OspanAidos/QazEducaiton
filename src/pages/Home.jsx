import Hero from "../components/Hero.jsx";
import Partners from "../components/Partners.jsx";
import Benefits from "../components/Benefits.jsx";
import Selection from "../components/Selection.jsx";
import Notices from "../components/Notices.jsx";
import Closing from "../components/Closing.jsx";

export default function Home({ t }) {
  return (
    <>
      <Hero t={t} />
      <Partners t={t} />
      <Benefits t={t} />
      <Selection t={t} />
      <Notices t={t} />
      <Closing t={t} />
    </>
  );
}
