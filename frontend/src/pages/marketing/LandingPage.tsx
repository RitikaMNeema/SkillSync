import { ArrowRight, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { LinkedInWordmark } from "../../components/layout/LinkedInWordmark";

function HeroIllustration() {
  return (
    <div className="relative mx-auto flex w-full max-w-[760px] justify-center">
      <div className="absolute inset-x-12 bottom-8 top-12 rounded-[42px] bg-[linear-gradient(135deg,#eef4f8_0%,#fff6e7_58%,#f6e7d1_100%)]" />
      <div className="absolute left-10 top-24 h-16 w-32 rounded-full bg-white/70 blur-[2px]" />
      <div className="absolute right-20 top-20 h-24 w-24 rounded-[28px] bg-[#f7e6d0]" />
      <div className="absolute left-4 bottom-20 h-40 w-40 rounded-full bg-[#f4e0bf]/80 blur-[2px]" />

      <svg
        viewBox="0 0 760 620"
        className="relative z-10 w-full drop-shadow-[0_22px_50px_rgba(40,60,80,0.12)]"
        aria-hidden="true"
      >
        <rect x="470" y="140" width="190" height="278" rx="18" fill="#fff8eb" />
        <rect x="488" y="172" width="50" height="96" rx="8" fill="#cad6c6" />
        <rect x="542" y="172" width="34" height="96" rx="8" fill="#7f9473" />
        <rect x="582" y="172" width="22" height="96" rx="8" fill="#205e6a" />
        <rect x="612" y="172" width="16" height="96" rx="8" fill="#edc58b" />
        <rect x="488" y="288" width="140" height="14" rx="7" fill="#f2d6b0" />
        <rect x="488" y="312" width="104" height="14" rx="7" fill="#eed09d" />
        <rect x="488" y="340" width="126" height="58" rx="12" fill="#f4c796" />

        <rect x="298" y="344" width="196" height="118" rx="22" fill="#12243b" />
        <rect x="316" y="360" width="160" height="88" rx="12" fill="#233854" />
        <rect x="290" y="456" width="214" height="12" rx="6" fill="#10213a" />

        <ellipse cx="212" cy="504" rx="124" ry="34" fill="#a9cfd0" />
        <ellipse cx="126" cy="468" rx="118" ry="25" fill="#8bb9bf" />

        <path d="M172 278C183 250 212 234 247 234H338C387 234 410 264 415 305L428 414H212L172 278Z" fill="#efe4cf" />
        <path d="M182 414H447L456 468H155L182 414Z" fill="#ffe5b7" />

        <path d="M394 268C434 237 490 258 504 307L523 375C531 405 519 435 492 448L458 465L394 268Z" fill="#165865" />
        <path d="M453 457L504 466L534 548C541 567 528 586 508 587H482L453 457Z" fill="#165865" />
        <path d="M394 268C376 284 360 316 356 355L348 426L270 598H231L262 415L274 319C279 273 314 238 359 230L394 268Z" fill="#5c5c45" />
        <path d="M330 598H243C239 584 246 573 262 568L319 548L330 598Z" fill="#eab598" />

        <path d="M336 377C365 353 411 356 451 380L517 419C531 427 541 440 546 455L520 478L448 448L377 433L336 377Z" fill="#7a412f" />
        <path d="M351 318L372 376L317 405C300 414 281 412 266 401L227 372L251 350L295 357L351 318Z" fill="#7a412f" />

        <path d="M392 194C417 194 438 214 438 239V272C438 304 412 330 380 330C350 330 325 307 325 277V239C325 214 346 194 372 194H392Z" fill="#7a412f" />
        <path d="M322 231C325 196 353 173 389 173C431 173 458 197 460 240L428 262L418 231L397 244L378 204L368 237L338 248L322 231Z" fill="#0f2626" />

        <path d="M298 398C309 386 326 381 341 384L402 398C427 404 447 423 452 448L475 566H405L392 482L329 470C299 465 274 444 269 414L298 398Z" fill="#dbe7ea" />
        <path d="M465 566H402C396 549 405 535 424 532L462 528L465 566Z" fill="#dbe7ea" />

        <path d="M251 350C270 333 298 325 322 329L355 334L346 365L309 373L273 370L251 350Z" fill="#7a412f" />

        <rect x="503" y="438" width="74" height="74" rx="12" fill="#fff8eb" />
        <rect x="589" y="438" width="74" height="74" rx="12" fill="#fff8eb" />
        <rect x="503" y="524" width="160" height="48" rx="18" fill="#b9cdbd" />
        <rect x="532" y="515" width="104" height="13" rx="6.5" fill="#f7f0e5" />

        <circle cx="542" cy="154" r="30" fill="#d4e3f0" />
        <path d="M525 152C532 138 549 132 564 138C570 148 568 159 559 168H539C531 165 526 160 525 152Z" fill="#80986d" />
        <path d="M518 144C524 138 530 136 538 138L530 154L535 166C526 169 520 166 516 158Z" fill="#9db7cb" />
      </svg>
    </div>
  );
}

export function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-[#1f1f1f]">
      <header className="border-b border-[#edf1f5]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6 lg:px-8">
          <LinkedInWordmark />
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-full px-5 py-3 text-[1.05rem] font-semibold text-[#4f4f4f] transition hover:bg-[#f3f6f8] hover:no-underline"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="rounded-full border border-[#0a66c2] bg-[#0a66c2] px-6 py-3 text-[1.05rem] font-semibold text-white transition hover:bg-[#005eb8] hover:no-underline"
            >
              Join now
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-93px)] max-w-[1240px] items-center gap-14 px-6 py-16 lg:grid-cols-[minmax(0,510px)_minmax(0,1fr)] lg:px-8 lg:py-20">
        <div className="max-w-[520px]">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#0a66c2]">Professional Networking, Reimagined</p>
          <h1 className="text-[3.4rem] font-semibold leading-[1.03] tracking-[-0.04em] text-[#191919] md:text-[4.6rem]">
            Build your career and grow your network with confidence
          </h1>
          <p className="mt-6 max-w-[470px] text-[1.16rem] leading-8 text-[#5b5b5b]">
            Discover jobs, connect with recruiters, and create a profile that helps the right opportunities find you.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:max-w-[380px]">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0a66c2] px-7 py-4 text-lg font-semibold text-white transition hover:bg-[#005eb8] hover:no-underline"
            >
              Get started
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-3 rounded-full border border-[#6f6f6f] bg-white px-7 py-4 text-lg font-semibold text-[#383838] transition hover:border-[#3d3d3d] hover:bg-[#f8fafb] hover:no-underline"
            >
              <Mail className="h-5 w-5" />
              Sign in with email
            </Link>
          </div>

          <p className="mt-7 max-w-[460px] text-sm leading-7 text-[#696969]">
            By continuing, you agree to LinkedIn&apos;s User Agreement, Privacy Policy, and Cookie Policy.
          </p>
          <p className="mt-8 text-[1.05rem] text-[#393939]">
            New here?{" "}
            <Link to="/register" className="font-semibold text-[#0a66c2]">
              Join now
            </Link>
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-[48px] bg-[radial-gradient(circle_at_top_left,_rgba(10,102,194,0.08),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(237,197,139,0.22),_transparent_42%)]" />
          <HeroIllustration />
        </div>
      </section>
    </main>
  );
}
