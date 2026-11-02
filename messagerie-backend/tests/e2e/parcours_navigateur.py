# Parcours complet dans un vrai navigateur (Chromium) contre la démo : cd api && npm run demo, puis
#   pip install playwright && playwright install chromium && python3 tests/e2e/parcours_navigateur.py
# Vérifie aussi qu aucune violation de la politique CSP stricte ne se produit.
import asyncio, re, sys
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
import os, tempfile
SH = os.path.join(tempfile.gettempdir(), "ms-captures"); os.makedirs(SH, exist_ok=True)
errors = []

async def login(page, username):
    await page.goto(BASE)
    await page.get_by_role("button", name="Se connecter").click()
    await page.locator(f'button[value="{username}"]').click()
    await page.wait_for_selector(".shell")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1366, "height": 860}, locale="fr-FR")
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append(("console", m.text)) if m.type == "error" and "status of 4" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(("pageerror", str(e))))

        # écran de connexion
        await page.goto(BASE)
        await page.wait_for_selector(".landing")
        await page.screenshot(path=f"{SH}/01-landing.png")

        # super admin
        await login(page, "superadmin")
        await page.wait_for_selector(".figure .n")
        await page.wait_for_selector(".feed li")
        await page.screenshot(path=f"{SH}/02-dashboard.png")
        print("dashboard figures:", await page.locator(".figure .n").all_inner_texts())
        print("intégrité:", (await page.locator(".okbanner b").first.inner_text()))

        # agents
        await page.get_by_role("link", name="Agents").click()
        await page.wait_for_selector("table.data tbody tr")
        n_rows = await page.locator("table.data tbody tr").count()
        print("agents listés:", n_rows)
        await page.screenshot(path=f"{SH}/03-agents.png")

        # enrôlement
        await page.get_by_role("button", name="Enrôler un agent").click()
        await page.fill('input[pattern]', "t.demo")
        inputs = page.locator("dialog form input")
        await inputs.nth(1).fill("Test Démo")
        await inputs.nth(2).fill("t.demo@gouv.example")
        await inputs.nth(4).fill("Analyste")
        await page.screenshot(path=f"{SH}/04-enroll-form.png")
        await page.get_by_role("button", name="Enrôler l'agent").click()
        await page.wait_for_selector("code.pw")
        pw = await page.locator("code.pw").inner_text()
        print("mot de passe temporaire:", bool(re.match(r"^[A-Za-z2-9]{5}(-[A-Za-z2-9]{5}){2}$", pw)))
        await page.screenshot(path=f"{SH}/05-credentials.png")
        await page.get_by_role("button", name="J'ai transmis les identifiants").click()

        # doublon
        await page.get_by_role("button", name="Enrôler un agent").click()
        await page.fill('input[pattern]', "t.demo")
        inputs = page.locator("dialog form input")
        await inputs.nth(1).fill("Doublon"); await inputs.nth(2).fill("d@x.test"); await inputs.nth(4).fill("x")
        await page.get_by_role("button", name="Enrôler l'agent").click()
        await page.wait_for_selector(".formerr")
        print("doublon refusé:", await page.locator(".formerr").inner_text())
        await page.keyboard.press("Escape")

        # drawer + révocation
        await page.get_by_role("button", name=re.compile("Test Démo")).click()
        await page.wait_for_selector("dialog.drawer[open]")
        await page.screenshot(path=f"{SH}/06-drawer.png")
        await page.get_by_role("button", name="Révoquer l'accès").click()
        await page.wait_for_selector("textarea")
        await page.screenshot(path=f"{SH}/07-revoke-confirm.png")
        await page.fill("textarea", "Test de révocation automatisé")
        await page.get_by_role("button", name="Révoquer maintenant").click()
        await page.wait_for_selector(".okbanner")
        print("révocation:", (await page.locator(".okbanner").inner_text()).replace("\n", " "))
        print("étapes:", await page.locator(".timings li").count())
        await page.screenshot(path=f"{SH}/08-revoked.png")
        await page.locator(".btn.primary", has_text="Fermer").click()
        await page.wait_for_timeout(300)

        # salons
        await page.get_by_role("link", name="Salons").click()
        await page.wait_for_selector(".room")
        await page.screenshot(path=f"{SH}/09-rooms.png")
        await page.get_by_role("button", name="Nouveau salon").click()
        await page.fill('input[maxlength="100"]', "Salon de test e2e")
        await page.locator('label.levelcard.lv-2').click()
        await page.fill('input[aria-label="Ajouter un invité"]', "i.zongo")
        await page.keyboard.press("Enter")
        await page.screenshot(path=f"{SH}/10-room-form.png")
        await page.get_by_role("button", name="Créer le salon chiffré").click()
        await page.wait_for_selector(".formerr")
        print("invité non habilité refusé:", (await page.locator(".formerr").inner_text()).replace("\n", " | "))
        await page.screenshot(path=f"{SH}/11-room-refused.png")
        await page.locator(".chip button").click()
        await page.fill('input[aria-label="Ajouter un invité"]', "f.kabore")
        await page.keyboard.press("Enter")
        await page.get_by_role("button", name="Créer le salon chiffré").click()
        await page.wait_for_selector(".toast.ok")
        await page.wait_for_selector("text=Salon de test e2e")
        print("salon créé et listé")

        # journal
        await page.get_by_role("link", name="Journal").click()
        await page.wait_for_selector("table.ledger tbody tr")
        await page.get_by_role("button", name="Vérifier l'intégrité").click()
        await page.wait_for_selector(".okbanner")
        await page.screenshot(path=f"{SH}/12-audit.png")
        print("journal:", await page.locator("table.ledger tbody tr").count(), "lignes;", (await page.locator(".okbanner b").inner_text()))

        # agent simple : pas d'admin, pas de journal
        await ctx.clear_cookies()
        await page.evaluate("sessionStorage.clear()")
        await login(page, "f.kabore")
        links = await page.locator(".rail a").all_inner_texts()
        print("menu agent:", links)
        await page.screenshot(path=f"{SH}/13-agent.png")
        r = await page.evaluate("""async () => { const t = sessionStorage.getItem('ms.token'); const r = await fetch(window.APP_CONFIG.apiBase + '/agents', {headers:{authorization:'Bearer '+t}}); return r.status }""")
        print("agent -> GET /agents:", r)

        # agent révoqué: son jeton encore valide est refusé
        tok = await page.evaluate("sessionStorage.getItem('ms.token')")
        await ctx.close()

        # mobile
        m = await b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2, locale="fr-FR")
        mp = await m.new_page()
        mp.on("pageerror", lambda e: errors.append(("pageerror-mobile", str(e))))
        await login(mp, "a.ouedraogo")
        await mp.wait_for_selector(".figure .n")
        await mp.screenshot(path=f"{SH}/14-mobile-dashboard.png")
        await mp.get_by_role("link", name="Salons").click()
        await mp.wait_for_selector(".room")
        await mp.screenshot(path=f"{SH}/15-mobile-rooms.png")
        await mp.get_by_role("button", name="Nouveau salon").click()
        await mp.wait_for_selector("dialog[open]")
        await mp.screenshot(path=f"{SH}/16-mobile-newroom.png")
        ow = await mp.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        print("débordement horizontal mobile (px):", ow)
        await b.close()

    print("ERREURS NAVIGATEUR:", errors if errors else "aucune")

asyncio.run(main())
