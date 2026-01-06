import numpy as np
import random
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.patches import Circle, Wedge
import matplotlib.colors as mcolors

TIPI_VOZIL = {
    "avto": 1,
    "limuzina": 3,
    "tovornjak": 6,
}

class Avto:
    """predstavlja avto v modelu"""
    def __init__(self, poz, pas=0, hitrost=0, max_hitrost=5, color=None, tip="avto"):
        self.poz = poz          # index celice
        self.hitrost = hitrost
        self.pas = pas
        self.max_hitrost = max_hitrost
        self.tip = tip
        self.dolzina = TIPI_VOZIL[tip]
        if color:
            self.color = color
        else:
            # Izogni se pretemnim (skoraj crnim) barvam.
            while True:
                value = random.randint(0, 0xFFFFFF)
                r = (value >> 16) & 0xFF
                g = (value >> 8) & 0xFF
                b = value & 0xFF
                if (r + g + b) >= 120:
                    self.color = "#{:06x}".format(value)
                    break

    def update_hitrost(self, razdalja, omejitev=None, front_speed=None, limit_ahead=None):
        """sprejme razdaljo do naslednjega avta in temu ustrezno spremeni hitrost"""

        #limit ahead - v naslednjih 15 celicah se začne omejitev

        hitrost = self.hitrost
        max_dovoljena = self.max_hitrost
        
        # Koliko je treutna maksimalna dovoljena hitrost?
        if omejitev is not None:
            max_dovoljena = min(max_dovoljena, omejitev)

        # ciljna hitrost glede na lookahead, ovire in omejitve
        ## target brez česarkoli
        target = min(hitrost + 1, max_dovoljena)

        ## KMALU OMEJITEV
        if limit_ahead is not None:
            target = min(target, limit_ahead)

        ## SPREDAJ NEKAJ
        if razdalja is not None:  # lahko je razdalja = 0
            ## če ima spredni avto hitrost je premik lahko večji
            if front_speed is not None:
                target = min(target, razdalja + front_speed)

            ## spredaj ovira, lahko se premaknemo samo za razdaljo
            else:
                target = min(target, razdalja)
                
        # Želim postopno zaviranje če je možno
        # (razen ko je ovira/bliznja situacija, kjer je dovoljen vecji padec
        if target < hitrost:
            if razdalja is not None and razdalja <= hitrost:
                hitrost = target
            else:
                hitrost = max(hitrost - 2, target)
        else:
            hitrost = target

        # nakljucno zaviranje
        # p = random.uniform(0, 1)
        # if p < p_zaviranje and hitrost > 0:
        #     hitrost -= 1

        return max(hitrost, 0)

    # def update_pozicija(self, razdalja):
    #     """sprejme razdaljo do naslednjega avta in temu ustrezno spremeni pozicijo"""
    #     self.poz = (self.poz + self.hitrost) % dolzina_ceste
    #     return self.poz

class Ovira:
    """predstavlja oviro na cesti v modelu"""
    def __init__(self, poz, pas=0):
        self.poz = poz   
        self.pas = pas

class Cesta:
    def __init__(self, dolzina_ceste=1000, p_zaviranje=0.3, omejitve=None, lookahead=15):
        self.dolzina_ceste = dolzina_ceste
        self.st_pasov = 2
        self.cesta = [[None] * dolzina_ceste for _ in range(self.st_pasov)]
        self.p_zaviranje = p_zaviranje
        self.max_hitrost = 7 #zaenkrat da vse deluje, to se uporabi da nardi graf
        self.lookahead = lookahead
        self.cas = 0
        self.avti = []
        self.ovire = []
        self.cesta_omejitve = [None] * dolzina_ceste
        if omejitve:
            self.set_omejitve(omejitve)

    def random_cars(self, max_hitrost=5, max_hitrost_interval=None, gostota=0.05):
        # Nakljucno razporedi avte po pasovih glede na gostoto.
        gostota = gostota / self.st_pasov
        for pas in range(self.st_pasov):
            for i in range(self.dolzina_ceste):  # Random postavitev avtov
                if random.random() < gostota and self.cesta[pas][i] == None:
                    avto_max_hitrost = (
                        random.randint(*max_hitrost_interval)
                        if max_hitrost_interval
                        else max_hitrost
                    )
                    avto = Avto(i, pas=pas, max_hitrost=avto_max_hitrost)
                    self.avti.append(avto)
                    self.cesta[pas][i] = avto

    def random_vozila(self, max_hitrost=5, max_hitrost_interval=None, gostota=0.05):
        # Nakljucno razporedi vozila - lahko tudi tovrnjak po pasovih glede na gostoto.
        gostota = gostota / self.st_pasov
        for pas in range(self.st_pasov):
            for i in range(self.dolzina_ceste):  # Random postavitev avtov
                if random.random() < gostota:
                    r = random.random()
                    if r < 0.6:
                        vozilo = "avto"
                    elif r < 0.8:
                        vozilo = "limuzina"
                    else:
                        vozilo = "tovornjak"
                    vozilo_dolzina = TIPI_VOZIL.get(vozilo, 1)
                    if not self.lahko_postavis(pas, i, vozilo_dolzina):
                        continue
                    avto_max_hitrost = (
                        random.randint(*max_hitrost_interval)
                        if max_hitrost_interval
                        else max_hitrost
                    )
                    avto = Avto(i, pas=pas, max_hitrost=avto_max_hitrost, tip=vozilo)
                    self.avti.append(avto)
                    self.avto_na_cesti(self.cesta, avto)

    def add_vozilo(self, pozicija, pas, max_hitrost, tip, color=None):
        # Rocno dodamo vozilo na cesto, ce je celica prosta.
        if self.lahko_postavis(pas, pozicija, TIPI_VOZIL[tip]):
            avto = Avto(pozicija, pas=pas, max_hitrost=max_hitrost, color=color, tip=tip)
            self.avti.append(avto)
            self.avto_na_cesti(self.cesta, avto)
            return True
        else:
            return False

    def add_obstacle(self, pozicija, pas):
        # Doda oviro na cesto in jo shrani v seznam ovir.
        ovira = Ovira(pozicija, pas)
        self.ovire.append(ovira)
        self.cesta[pas][pozicija] = ovira

    def set_omejitve(self, omejitve):
        # Nastavi omejitve hitrosti po pozicijah ceste.
        self.cesta_omejitve = [None] * self.dolzina_ceste
        for omejitev in omejitve:
            for i in range(omejitev["od"], omejitev["do"]):
                if 0 <= i < self.dolzina_ceste:
                    self.cesta_omejitve[i] = omejitev["max_hitrost"]
        print(self.cesta)

    def omejitev_na_poziciji(self, pozicija):
        # Vrne omejitev hitrosti na poziciji ali None, ce je ni.
        return self.cesta_omejitve[pozicija]

    def info_naprej(self, pas, pozicija, lookahead=None):
        # Vrne (razdalja, front_speed, limit_ahead) za dolocen avto
        if lookahead is None:
            lookahead = self.lookahead
        razdalja = self.razdalja_do_naslednjega(pas, pozicija)
        front_speed = None
        if razdalja is not None and razdalja <= lookahead:
            poz_obj = (pozicija + razdalja + 1) % self.dolzina_ceste
            obj = self.cesta[pas][poz_obj]
            if isinstance(obj, Avto):
                front_speed = obj.hitrost
            elif isinstance(obj, Ovira):
                front_speed = 0

        limit_ahead = None
        for d in range(0, lookahead + 1): # Dokler smo pod omejitvijo ne pospešujemo
            poz = (pozicija + d) % self.dolzina_ceste
            omejitev = self.cesta_omejitve[poz]
            if omejitev is not None:
                if limit_ahead is None or omejitev < limit_ahead:
                    limit_ahead = omejitev

        return razdalja, front_speed, limit_ahead

    def razdalja_do_naslednjega(self, pas, pozicija):
        """Izračuna razdaljo do naslednjega avtomobila"""
        # ne sme videt samega sebe, ko pogleda naprej, preveri če je to slučajno isto objekt
        razdalja = 1
        while self.cesta[pas][(pozicija + razdalja) % self.dolzina_ceste] is None:
            razdalja += 1
            if razdalja > self.dolzina_ceste:
                return None
        return razdalja - 1
        
    
    def razdalja_do_prejsnjega(self, pas, pozicija, avto):
        """Izračuna razdaljo do prejšnjega avtomobila zadaj"""
        # steje sele po temu ko pride do konca samega sebe
        razdalja = avto.dolzina
        while self.cesta[pas][(pozicija - razdalja) % self.dolzina_ceste] is None:
            razdalja += 1
            if razdalja > self.dolzina_ceste:
                return None
        return razdalja - avto.dolzina

    def korak_simulacije(self):
        """En korak simulacije"""
        # print("Posodabljam \n")
        
        # Možna sprememba pasu
        lane_changes = []
        for avto in self.avti:
            novi_pas = should_change_lane(self, avto, self.cas, lookahead=self.lookahead)
            # to ubistvu preverim že v lane change?
            if novi_pas is not None and self.lahko_postavis(novi_pas, avto.poz, avto.dolzina):
                lane_changes.append((avto, novi_pas))

        for avto, novi_pas in lane_changes:
            self.odstrani_avto_na_cesti(self.cesta, avto)
            avto.pas = novi_pas
            self.avto_na_cesti(self.cesta, avto)

        # Posodobitev hitrosti
        for avto in self.avti:
            razdalja, front_speed, limit_ahead = self.info_naprej(avto.pas, avto.poz)
            omejitev = self.omejitev_na_poziciji(avto.poz)
            avto.hitrost = avto.update_hitrost(
                razdalja,
                omejitev,
                front_speed=front_speed,
                limit_ahead=limit_ahead,
            )
            # nakljucno zaviranje
            p = random.uniform(0, 1)
            if p < self.p_zaviranje and avto.hitrost > 0:
                avto.hitrost -= 1



        # Premikanje avtomobilov
        nova_cesta = [[None] * self.dolzina_ceste for _ in range(self.st_pasov)]
        for ovira in self.ovire:
            nova_cesta[ovira.pas][ovira.poz] = ovira
        for avto in self.avti:
            nova_pozicija = (avto.poz + avto.hitrost) % self.dolzina_ceste
            avto.poz = nova_pozicija
            self.avto_na_cesti(nova_cesta, avto)
        
        self.cesta = nova_cesta
        self.cas += 1

    def pozicija_skupaj(self, pozicija_glava, dolzina):
        # dobim od kje do kje je avto
        return [((pozicija_glava - i) % self.dolzina_ceste) for i in range(dolzina)]
    
    def avto_na_cesti(self, cesta, avto, pas=None, pozicija=None):
        # da se mi obarvajo celice ceste enako
        pas = avto.pas if pas is None else pas #da loh uporabim pri testiranju za prehitevanje
        pozicija = avto.poz if pozicija is None else pozicija
        for poz in self.pozicija_skupaj(pozicija, avto.dolzina):
            cesta[pas][poz] = avto

    def odstrani_avto_na_cesti(self, cesta, avto, pas=None, pozicija=None):
        pas = avto.pas if pas is None else pas
        pozicija = avto.poz if pozicija is None else pozicija
        for pos in self.pozicija_skupaj(pozicija, avto.dolzina):
            if cesta[pas][pos] is avto:
                cesta[pas][pos] = None

    def lahko_postavis(self, pas, pozicija, dolzina, avto=None):
        # spet potrebno da ko gleda ne vidi sebe, ker se bo itak prestavil
        for poz in self.pozicija_skupaj(pozicija, dolzina):
            obj = self.cesta[pas][poz]
            if obj is not None and obj != avto: 
                return False
        return True
    
def should_change_lane(cesta, avto, cas,
                       lookahead=15,
                       safe_gap_front=2,
                       safe_gap_back=2,
                       delta_hitrost_hitri_zadaj=1):
    """
    Odločanje o menjavi pasu z dinamiko sodih/lihih korakov in oceno kvalitete pasu.
    """

    if cesta.st_pasov < 2:
        return None

    pas = avto.pas
    poz = avto.poz
    L = cesta.dolzina_ceste
    trenutna_hitrost = avto.hitrost
    omejitev = cesta.omejitev_na_poziciji(avto.poz)

    ##### TRENUTNI PAS  
    razdalja_spredaj, front_speed, limit_ahead = cesta.info_naprej(pas, poz, lookahead)
    # print(razdalja_spredaj, front_speed, limit_ahead)
    naslednja_hitrost = avto.update_hitrost(razdalja_spredaj, omejitev, front_speed, limit_ahead)

    # mora nujno zavirati
    bo_moral_zavirati = razdalja_spredaj is not None and razdalja_spredaj <= trenutna_hitrost

    # Mora nujno zavirati ker je ovira (uporabimo na levem pasu, prehitevanje na desnem prepovedano)
    bo_moral_zavirati_ovira = bo_moral_zavirati and isinstance(cesta.cesta[pas][(poz+razdalja_spredaj+1) % L], Ovira)

    # Pred njim počasen avto, ni nujno da je že na razdalji, da je potrebno zavirati
    spredaj_slow_avto = front_speed is not None and front_speed < trenutna_hitrost  # je to okej tako, lahko da oba upočasnujeta zaradi omejitve

    # Za njim hiter avto in se mora umakniti
    razdalja_zadaj_trenutni = cesta.razdalja_do_prejsnjega(pas, poz, avto)
    avto_zadaj = None
    if razdalja_zadaj_trenutni is not None and razdalja_zadaj_trenutni <= lookahead:
        poz_zadaj = (poz - razdalja_zadaj_trenutni) % L
        avto_zadaj = cesta.cesta[pas][poz_zadaj]

    hiter_avto_zadaj = (isinstance(avto_zadaj, Avto) and
        avto_zadaj.hitrost >= trenutna_hitrost + delta_hitrost_hitri_zadaj)
    
    ##### DRUGI PAS
    razdalja_spredaj_D, front_speed_D, limit_ahead = cesta.info_naprej(1-pas, avto.poz, lookahead)
    print(f"{(razdalja_spredaj_D, front_speed_D, limit_ahead)}")
    sosednja_mozna_hitrost = avto.update_hitrost(razdalja_spredaj_D, omejitev, front_speed_D, limit_ahead)

    # mora nujno zavirati (ne zaradi omejitve)
    bo_moral_zavirati_D = razdalja_spredaj_D is not None and razdalja_spredaj_D <= trenutna_hitrost

    # Pred njim počasen avto, ni nujno da je že na razdalji, da je potrebno zavirati
    spredaj_slow_avto_D = front_speed_D is not None and front_speed_D < trenutna_hitrost  # je to okej tako, lahko da oba upočasnujeta zaradi omejitve

    razdalja_zadaj_D = cesta.razdalja_do_prejsnjega(1-pas, poz, avto)
    avto_zadaj = None
    if razdalja_zadaj_D is not None and razdalja_zadaj_D <= lookahead:
        poz_zadaj = (poz - razdalja_zadaj_D) % L
        avto_zadaj = cesta.cesta[1-pas][poz_zadaj]

    hiter_avto_zadaj_D = (isinstance(avto_zadaj, Avto) and
        avto_zadaj.hitrost >= trenutna_hitrost + delta_hitrost_hitri_zadaj)

    # Menjava iz desnega v levi pas (prehitevanje)
    if pas == 0:
        # lahko sploh menjamo
        if not cesta.lahko_postavis(1-pas, avto.poz, avto.dolzina):
            return None

        motivacija = bo_moral_zavirati or spredaj_slow_avto or (sosednja_mozna_hitrost > naslednja_hitrost) #to primerjavo moram dati stran, saj sicer ne morem imeti random zaviranja
        incentive = motivacija and (not hiter_avto_zadaj_D)
        print(sosednja_mozna_hitrost,naslednja_hitrost)
        print("trenutna", trenutna_hitrost)
        print(f"bo_moral_zavirati {bo_moral_zavirati}, spredaj_slow_avto {spredaj_slow_avto}, primerjaava {(sosednja_mozna_hitrost > naslednja_hitrost)}")

    # Menjava iz levega v desni pas (vracanje).
    if pas == 1:
        if not cesta.lahko_postavis(1-pas, avto.poz, avto.dolzina):
            return None

        ni_vec_potrebe_za_prehitevanje = (not bo_moral_zavirati_D) and (not spredaj_slow_avto_D)
        motivacija_hiter_zadaj = hiter_avto_zadaj
        incentive = (
            ni_vec_potrebe_za_prehitevanje
            or motivacija_hiter_zadaj 
            or bo_moral_zavirati_ovira)
        print(f"ni_vec_potrebe_za_prehitevanje: {ni_vec_potrebe_za_prehitevanje}, bo_moral_zavirati_D {bo_moral_zavirati_D}, spredaj_slow_avto_D {spredaj_slow_avto_D}")
        
    if incentive:
        # razdalja_pred = cesta.razdalja_do_naslednjega(1-pas, poz)
        # razdalja_zadaj = cesta.razdalja_do_prejsnjega(1-pas, poz)
        if razdalja_spredaj_D is None:
            razdalja_spredaj_D = L
        if razdalja_zadaj_D is None:
            razdalja_zadaj_D = L

        security = (razdalja_spredaj_D >= safe_gap_front and
                    razdalja_zadaj_D >= safe_gap_back)
        if security == False:
            print("Ne dovolim prehitevati")
        return (1-pas) if security else None
    else:
        return None


def info_o_pasu(cesta, avto, pas, lookahead=15):
    """
    Vrne oceno v_avg pasu: povprečna hitrost vozil v lookahead oknu
    """
    poz = avto.poz
    L = cesta.dolzina_ceste
    vmax = avto.max_hitrost

    vsota_hitrosti = 0.0
    st_avtov = 0
    for d in range(1, lookahead + 1):
        nova_poz = (poz + d) % L
        drugi = cesta.cesta[pas][nova_poz]
        if drugi is not None and isinstance(drugi, Avto):
            vsota_hitrosti += drugi.hitrost
            st_avtov += 1

    v_avg = vsota_hitrosti / st_avtov if st_avtov else 100 #ce ni avtov neka visoka številka
    return v_avg


def simple_vizualiziraj_simulacijo(model, koraki=50):
    """Vizualizira simulacijo"""
    stanja = []
    
    for _ in range(koraki):
        stanje = []
        for pas in range(model.st_pasov):
            stanje.extend(1 if avto is not None else 0 for avto in model.cesta[pas])
        stanja.append(stanje)
        model.korak_simulacije()
    
    plt.figure(figsize=(12, 8))
    plt.imshow(stanja, cmap='binary', aspect='auto')
    plt.xlabel('Pozicija na cesti')
    plt.ylabel('Čas (koraki)')
    plt.title('Nagel-Schreckenberg model prometa')
    plt.colorbar(label='Prisotnost avtomobila')
    plt.show()

# vizualiziraj_simulacijo(Cesta(dolzina_ceste=20), koraki=10)


def vizualizacija_kroga(model, koraki=100):
    """Krožna vizualizacija prometa"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 7))
    
    # Nastavitev kroga
    center_radius = 5
    lane_spacing = 0.6
    center = (0, 0)
    
    def lane_offset(pas):
        """Vrne odmik posameznega pasu relativno na srednjo krožnico."""
        return (pas - (model.st_pasov - 1) / 2) * lane_spacing
    
    def pozicija_na_krogu(pozicija, total, pas):
        """Pretvori linearno pozicijo v točko na izbranem pasu na krogu"""
        angle = 2 * np.pi * pozicija / total
        radius = center_radius + lane_offset(pas)
        x = radius * np.cos(angle)
        y = radius * np.sin(angle)
        return x, y, angle
    
    # Priprava za animacijo
    scatter = ax1.scatter([], [], s=100, alpha=0.7)
    scatter_ovire = ax1.scatter([], [], s=90, marker='s', color='black', alpha=0.9)
    
    # Nastavitev krožne ceste (en krog na pas)
    max_offset = lane_offset(model.st_pasov - 1) if model.st_pasov > 1 else 0
    min_offset = lane_offset(0) if model.st_pasov > 1 else 0
    outer_radius = center_radius + max_offset + lane_spacing / 2
    inner_radius = center_radius + min_offset - lane_spacing / 2
    inner_radius = max(inner_radius, 0.5)

    # Označi odseke z omejitvami hitrosti (ena barva cez oba pasova).
    omejitve = getattr(model, "cesta_omejitve", None)
    if omejitve:
        start = None
        current = None
        for idx, omejitev in enumerate(omejitve + [None]):
            if omejitev != current:
                if current is not None and start is not None:
                    theta1 = 360 * start / model.dolzina_ceste
                    theta2 = 360 * idx / model.dolzina_ceste
                    if theta2 < theta1:
                        theta2 += 360
                    arc = Wedge(
                        center,
                        r=outer_radius,
                        theta1=theta1,
                        theta2=theta2,
                        width=outer_radius - inner_radius,
                        facecolor="#f4a261",
                        edgecolor="none",
                        alpha=0.35,
                    )
                    ax1.add_patch(arc)
                    mid_angle = np.deg2rad((theta1 + theta2) / 2)
                    mid_radius = (outer_radius + inner_radius) / 2
                    ax1.text(
                        mid_radius * np.cos(mid_angle),
                        mid_radius * np.sin(mid_angle),
                        str(current),
                        ha="center",
                        va="center",
                        fontsize=10,
                        color="#7a3b00",
                    )
                start = idx if omejitev is not None else None
                current = omejitev
    
    outer_circle = Circle(center, outer_radius, fill=False, edgecolor='gray', linewidth=2)
    inner_circle = Circle(center, inner_radius, fill=False, edgecolor='gray', linewidth=2)
    ax1.add_patch(outer_circle)
    ax1.add_patch(inner_circle)
    
    # Dodaj vmesne črte med pasovi
    for idx in range(1, model.st_pasov):
        radius = center_radius + lane_offset(idx - 0.5)
        ax1.add_patch(Circle(center, radius, fill=False, edgecolor='gray', linewidth=1, linestyle='--'))
    
    plot_radius = max(outer_radius, inner_radius)
    ax1.set_xlim(-plot_radius-1, plot_radius+1)
    ax1.set_ylim(-plot_radius-1, plot_radius+1)
    ax1.set_aspect('equal')
    ax1.set_title('Krožna vizualizacija prometa\n(Barva = hitrost)', fontsize=14)
    ax1.cesta(True, alpha=0.3)
    
    # Priprava časovnega grafa
    časovna_os = list(range(koraki))
    povprecne_hitrosti = []
    ax2.set_xlim(0, koraki)
    ax2.set_ylim(0, model.max_hitrost + 1)
    ax2.set_xlabel('Čas (koraki)')
    ax2.set_ylabel('Povprečna hitrost')
    ax2.set_title('Razvoj hitrosti skozi čas')
    ax2.cesta(True, alpha=0.3)
    line, = ax2.plot([], [], 'b-', linewidth=2)
    
    def init():
        scatter.set_offsets(np.empty((0, 2)))
        line.set_data([], [])
        return scatter, scatter_ovire, line
    
    def update(frame):
        # Izvedi korak simulacije
        if frame == 0:
            povprecne_hitrosti.clear()
        if frame > 0:
            model.korak_simulacije()
        
        # Prikaži avte na krogu
        pozicije = []
        barve = []
        hitrosti = []
        pozicije_ovir = []
        
        for avto in model.avti:
            x, y, kot = pozicija_na_krogu(avto.poz, model.dolzina_ceste, avto.pas)
            pozicije.append([x, y])
            hitrosti.append(avto.hitrost)
            # Barva glede na hitrost
            barva = plt.cm.viridis(avto.hitrost / model.max_hitrost)
            barve.append(barva)

        for ovira in model.ovire:
            x, y, _ = pozicija_na_krogu(ovira.poz, model.dolzina_ceste, ovira.pas)
            pozicije_ovir.append([x, y])
        
        if pozicije:
            scatter.set_offsets(pozicije)
        else:
            scatter.set_offsets(np.empty((0, 2)))
        scatter.set_color(barve)
        scatter.set_sizes([80 + hitrost * 20 for hitrost in hitrosti])  # Velikost glede na hitrost

        if pozicije_ovir:
            scatter_ovire.set_offsets(pozicije_ovir)
        else:
            scatter_ovire.set_offsets(np.empty((0, 2)))
        
        # Posodobi časovni graf
        povprecna_hitrost = np.mean(hitrosti) if hitrosti else 0
        povprecne_hitrosti.append(povprecna_hitrost)
        
        line.set_data(časovna_os[:frame+1], povprecne_hitrosti)
        
        # Posodobi naslov s statistiko
        ax1.set_title(f'Krožna vizualizacija prometa\n'
                     f'Korak: {frame}, Avti: {len(model.avti)}, '
                     f'Povprečna hitrost: {povprecna_hitrost:.2f}', fontsize=12)
        
        return scatter, scatter_ovire, line
    
    # Ustvari animacijo
    anim = FuncAnimation(fig, update, frames=koraki, 
                        init_func=init, blit=True, interval=200, repeat=True)
    
    plt.tight_layout()
    plt.show()
    
    return anim

if __name__ == "__main__":
    # TESTIRAJ
    print("=== KROŽNA VIZUALIZACIJA ===")
    model = Cesta(dolzina_ceste=60, p_zaviranje=0.2, omejitve=[
    {"od": 10, "do": 25, "max_hitrost": 5},
    {"od": 40, "do": 50, "max_hitrost": 3},])
    model.random_cars(gostota=0.3, max_hitrost_interval=(3, 6))
    model.add_obstacle(15, 1)
    model.add_obstacle(16, 1)
    model.add_obstacle(17, 1)

    # Animacija
    print("Zaženem animacijo...")
    anim = vizualizacija_kroga(model, koraki=100)
