import { getRepoStats, formatCount } from '@/lib/github';
import { Reveal } from '@/components/Reveal';
import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { BrandBand } from '@/components/BrandBand';
import { Problem } from '@/components/Problem';
import { HowItWorks } from '@/components/HowItWorks';
import { Showcase } from '@/components/Showcase';
import { Features } from '@/components/Features';
import { Formats } from '@/components/Formats';
import { Download } from '@/components/Download';
import { Extension } from '@/components/Extension';
import { OpenSource } from '@/components/OpenSource';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { Footer } from '@/components/Footer';

export default async function Page() {
  const stats = await getRepoStats();
  const stars = formatCount(stats?.stars);

  return (
    <>
      <Reveal />
      <Nav stars={stars} />
      <main>
        <Hero stars={stars} />
        <BrandBand />
        <Problem />
        <HowItWorks />
        <Showcase />
        <Features />
        <Formats />
        <Download />
        <Extension />
        <OpenSource stats={stats} />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
