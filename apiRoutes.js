from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
import logging
import os
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
from psycopg2 import Error as Psycopg2Error
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app.debug = False  # Activer le mode debug pour voir les erreurs

# Connexion à la base de données locale PostgreSQL
def get_conn():
    try:
        return psycopg2.connect(
            dbname="restocafee",
            user="postgres",
            password="masterkey",
            host="localhost",
            port="5432"
        )
    except Exception as e:
        logging.error(f"Erreur de connexion à la base de données : {str(e)}")
        raise

# Configurez le logger
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def to_comma_decimal(value):
    """
    Convertit une valeur numérique en chaîne avec virgule comme séparateur décimal.
    Ex. : 1234.56 → '1234,56'
    """
    try:
        if isinstance(value, (int, float)):
            return f"{value:.2f}".replace(".", ",")
        return str(value).replace(".", ",")
    except (ValueError, TypeError):
        return "0,00"

def to_dot_decimal(value):
    """Convertit une chaîne avec virgule ou point (ex. '123,45', '-123.45') ou un nombre en flottant."""
    if isinstance(value, (int, float)):
        return float(value)
    if not value or not isinstance(value, str):
        return 0.0
    try:
        # Remplacer la virgule par un point et nettoyer la chaîne
        cleaned_value = value.replace(',', '.').strip()
        return float(cleaned_value)
    except ValueError:
        logger.error(f"Erreur de conversion décimale pour la valeur: {value}")
        return 0.0
# Route pour vérifier que l'API est en ligne
@app.route('/', methods=['GET'])
def index():
    try:
        conn = get_conn()
        conn.close()
        return 'API en ligne - Connexion PostgreSQL OK'
    except Exception as e:
        return f'Erreur connexion DB : {e}', 500

@app.route('/valider_vendeur', methods=['POST'])
def valider_vendeur():
    """
    Endpoint pour valider un vendeur en vérifiant son nom et son mot de passe.
    Reçoit un JSON avec 'nom' et 'password2'.
    Retourne les informations du vendeur si valide, sinon une erreur.
    """
    # Récupérer les données JSON de la requête
    data = request.get_json()
    if not data or 'nom' not in data or 'password2' not in data:
        logger.error("Données invalides: 'nom' ou 'password2' manquant")
        return jsonify({"erreur": "Le nom et le mot de passe sont requis"}), 400

    nom = data.get('nom')
    password2 = data.get('password2')

    try:
        # Établir la connexion à la base de données
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Requête pour vérifier l'utilisateur sans user_id
        cur.execute("""
            SELECT numero_util, nom, statue 
            FROM utilisateur 
            WHERE nom = %s AND password2 = %s
        """, (nom, password2))
        
        utilisateur = cur.fetchone()
        
        # Fermer le curseur et la connexion
        cur.close()
        conn.close()

        # Vérifier si l'utilisateur existe
        if not utilisateur:
            logger.error(f"Échec authentification: nom={nom}")
            return jsonify({"erreur": "Nom ou mot de passe incorrect"}), 401

        logger.info(f"Vendeur validé: numero_util={utilisateur['numero_util']}, nom={nom}")
        return jsonify({
            "statut": "Vendeur validé",
            "utilisateur": {
                "numero_util": utilisateur['numero_util'],
                "nom": utilisateur['nom'],
                "statut": utilisateur['statue']
            }
        }), 200

    except Exception as e:
        logger.error(f"Erreur lors de la validation du vendeur: {str(e)}", exc_info=True)
        # S'assurer que la connexion est fermée en cas d'erreur
        if 'conn' in locals() and conn:
            cur.close()
            conn.close()
        return jsonify({"erreur": str(e)}), 500

@app.route('/rechercher_produit_codebar', methods=['GET'])
def rechercher_produit_codebar():
    codebar = request.args.get('codebar')
    if not codebar:
        return jsonify({'erreur': 'Code-barres requis'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Rechercher d'abord par code-barres principal dans item
        cur.execute("""
            SELECT numero_item, bar, designation, prix, prixba, qte
            FROM item
            WHERE bar = %s
        """, (codebar,))
        produit = cur.fetchone()

        if produit:
            cur.close()
            conn.close()
            return jsonify({
                'statut': 'trouvé',
                'type': 'principal',
                'produit': produit
            }), 200

        # Si non trouvé, rechercher dans codebar pour un code-barres lié
        cur.execute("""
            SELECT i.numero_item, i.bar, i.designation, i.prix, i.prixba, i.qte
            FROM codebar c
            JOIN item i ON c.bar = i.numero_item::varchar
            WHERE c.bar2 = %s
        """, (codebar,))
        produit = cur.fetchone()

        if produit:
            cur.close()
            conn.close()
            return jsonify({
                'statut': 'trouvé',
                'type': 'lié',
                'produit': produit
            }), 200

        cur.close()
        conn.close()
        return jsonify({'erreur': 'Produit non trouvé'}), 404

    except Exception as e:
        if conn:
            conn.close()
        return jsonify({'erreur': str(e)}), 500

@app.route('/ajouter_codebar_lie', methods=['POST'])
def ajouter_codebar_lie():
    data = request.get_json()
    numero_item = data.get('numero_item')
    bar2 = data.get('barcode')

    if not numero_item:
        return jsonify({'erreur': 'numero_item est requis'}), 400

    try:
        numero_item = int(numero_item)
        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Vérifier que l'item existe
        cur.execute("SELECT 1 FROM item WHERE numero_item = %s", (numero_item,))
        item = cur.fetchone()
        if not item:
            cur.close()
            conn.close()
            return jsonify({'erreur': 'Produit non trouvé'}), 404

        # Vérifier que bar2 n'existe pas déjà
        if bar2:
            cur.execute("SELECT 1 FROM codebar WHERE bar2 = %s", (bar2,))
            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({'erreur': 'Ce code-barres lié existe déjà'}), 409

        # Générer un bar2 si non fourni
        cur.execute("SELECT bar2 FROM codebar")
        existing_barcodes = cur.fetchall()
        used_numbers = []
        for code in existing_barcodes:
            bar_num = int(code['bar2'][1:12]) if code['bar2'].startswith('1') and len(code['bar2']) == 13 and code['bar2'][1:12].isdigit() else 0
            used_numbers.append(bar_num)

        next_number = 1
        used_numbers = sorted(set(used_numbers))
        for num in used_numbers:
            if num == next_number:
                next_number += 1
            elif num > next_number:
                break

        if not bar2:
            code12 = f"1{next_number:011d}"
            check_digit = calculate_ean13_check_digit(code12)
            bar2 = f"{code12}{check_digit}"
            cur.execute("SELECT 1 FROM codebar WHERE bar2 = %s", (bar2,))
            if cur.fetchone():
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({'erreur': 'Le code EAN-13 généré existe déjà'}), 409

        cur.execute("LOCK TABLE codebar IN EXCLUSIVE MODE")
        cur.execute(
            "INSERT INTO codebar (bar2, bar) VALUES (%s, %s) RETURNING n",
            (bar2, numero_item)
        )
        codebar_id = cur.fetchone()['n']

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Code-barres lié ajouté', 'id': codebar_id, 'bar2': bar2}), 201
    except ValueError:
        conn.rollback()
        return jsonify({'erreur': 'numero_item doit être un nombre valide'}), 400
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        return jsonify({'erreur': str(e)}), 500

@app.route('/liste_codebar_lies', methods=['GET'])
def liste_codebar_lies():
    numero_item = request.args.get('numero_item')
    if not numero_item:
        return jsonify({'erreur': 'numero_item est requis'}), 400

    try:
        numero_item = int(numero_item)
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Vérifier que l'item existe
        cur.execute("SELECT 1 FROM item WHERE numero_item = %s", (numero_item,))
        item = cur.fetchone()
        if not item:
            cur.close()
            conn.close()
            return jsonify({'erreur': 'Produit non trouvé'}), 404

        # Récupérer les codes-barres liés en castant bar en INTEGER
        cur.execute("SELECT bar2 FROM codebar WHERE bar::INTEGER = %s ORDER BY n", (numero_item,))
        linked_barcodes = [row['bar2'] for row in cur.fetchall()]

        cur.close()
        conn.close()
        return jsonify({'linked_barcodes': linked_barcodes}), 200
    except ValueError:
        if conn:
            conn.close()
        return jsonify({'erreur': 'numero_item doit être un nombre valide'}), 400
    except Exception as e:
        if conn:
            conn.close()
        return jsonify({'erreur': str(e)}), 500

@app.route('/supprimer_codebar_lie', methods=['POST'])
def supprimer_codebar_lie():
    data = request.get_json()
    numero_item = data.get('numero_item')
    bar2 = data.get('bar2')

    if not numero_item or not bar2:
        return jsonify({'erreur': 'numero_item et bar2 sont requis'}), 400

    try:
        numero_item_str = str(numero_item)
        conn = get_conn()
        conn.autocommit = False
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            # Vérifier que l'item existe
            cur.execute("SELECT 1 FROM item WHERE numero_item = %s", (int(numero_item),))
            item = cur.fetchone()
            if not item:
                raise Exception('Produit non trouvé')

            # Vérifier que le code-barres lié existe
            cur.execute("SELECT 1 FROM codebar WHERE bar2 = %s AND bar = %s", (bar2, numero_item_str))
            if not cur.fetchone():
                raise Exception('Code-barres lié non trouvé pour ce produit')

            # Supprimer le code-barres lié
            cur.execute("DELETE FROM codebar WHERE bar2 = %s AND bar = %s", (bar2, numero_item_str))

            conn.commit()
            return jsonify({'statut': 'Code-barres lié supprimé'}), 200
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cur.close()
            conn.close()
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500

# --- Clients ---




@app.route('/liste_clients', methods=['GET'])
def liste_clients():
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT numero_clt, nom, solde, reference, contact, adresse FROM client ORDER BY nom")
        rows = cur.fetchall()

        clients = [
            {
                'numero_clt': row['numero_clt'],
                'nom': row['nom'] or '',
               'solde': to_comma_decimal(to_dot_decimal(row['solde'] or '0,00')),  # Conversion robuste
                'reference': row['reference'] or '',
                'contact': row['contact'] or '',
                'adresse': row['adresse'] or ''
            }
            for row in rows
        ]

        logger.info(f"Récupération de {len(clients)} clients")
        return jsonify(clients), 200

    except Psycopg2Error as e:
        logger.error(f"Erreur PostgreSQL lors de la récupération des clients: {str(e)}")
        return jsonify({'erreur': f"Erreur de base de données: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Erreur inattendue lors de la récupération des clients: {str(e)}")
        return jsonify({'erreur': f"Erreur serveur: {str(e)}"}), 500
    finally:
        if conn:
            cur.close()
            conn.close()

@app.route('/ajouter_client', methods=['POST'])
def ajouter_client():
    data = request.get_json()
    nom = data.get('nom')
    contact = data.get('contact')
    adresse = data.get('adresse')

    if not nom:
        return jsonify({'erreur': 'Le champ nom est obligatoire'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        # Compter les clients
        cur.execute("SELECT COUNT(*) FROM client")
        count = cur.fetchone()[0]
        reference = f"C{count + 1}"

        # Insérer avec solde = '0,00'
        cur.execute(
            "INSERT INTO client (nom, solde, reference, contact, adresse) VALUES (%s, %s, %s, %s, %s) RETURNING numero_clt",
            (nom, '0,00', reference, contact, adresse)
        )
        client_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Client ajouté', 'id': client_id, 'reference': reference}), 201
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500

@app.route('/modifier_client/<numero_clt>', methods=['PUT'])
def modifier_client(numero_clt):
    data = request.get_json()
    nom = data.get('nom')
    contact = data.get('contact')
    adresse = data.get('adresse')

    if not nom:
        return jsonify({'erreur': 'Le champ nom est obligatoire'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE client SET nom = %s, contact = %s, adresse = %s WHERE numero_clt = %s RETURNING numero_clt",
            (nom, contact, adresse, numero_clt)
        )
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'erreur': 'Client non trouvé'}), 404

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Client modifié'}), 200
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500
@app.route('/supprimer_client/<numero_clt>', methods=['DELETE'])
def supprimer_client(numero_clt):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM client WHERE numero_clt = %s", (numero_clt,))
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'erreur': 'Client non trouvé'}), 404
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Client supprimé'}), 200
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500

# --- Fournisseurs ---


@app.route('/liste_fournisseurs', methods=['GET'])
def liste_fournisseurs():
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT numero_fou, nom, solde, reference, contact, adresse FROM fournisseur ORDER BY nom")
        rows = cur.fetchall()

        fournisseurs = [
            {
                'numero_fou': row['numero_fou'] or '',
                'nom': row['nom'] or '',
                'solde': to_comma_decimal(to_dot_decimal(row['solde'] or '0,00')),  # Conversion robuste
                'reference': row['reference'] or '',
                'contact': row['contact'] or '',
                'adresse': row['adresse'] or ''
            }
            for row in rows
        ]

        logger.info(f"Récupération de {len(fournisseurs)} fournisseurs")
        return jsonify(fournisseurs), 200

    except Psycopg2Error as e:
        logger.error(f"Erreur PostgreSQL lors de la récupération des fournisseurs: {str(e)}")
        return jsonify({'erreur': f"Erreur de base de données: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Erreur inattendue lors de la récupération des fournisseurs: {str(e)}")
        return jsonify({'erreur': f"Erreur serveur: {str(e)}"}), 500
    finally:
        if conn:
            cur.close()
            conn.close()
@app.route('/modifier_fournisseur/<numero_fou>', methods=['PUT'])
def modifier_fournisseur(numero_fou):
    data = request.get_json()
    nom = data.get('nom')
    contact = data.get('contact')
    adresse = data.get('adresse')

    if not nom:
        return jsonify({'erreur': 'Le champ nom est obligatoire'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE fournisseur SET nom = %s, contact = %s, adresse = %s WHERE numero_fou = %s RETURNING numero_fou",
            (nom, contact, adresse, numero_fou)
        )
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'erreur': 'Fournisseur non trouvé'}), 404

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Fournisseur modifié'}), 200
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500

@app.route('/ajouter_fournisseur', methods=['POST'])
def ajouter_fournisseur():
    data = request.get_json()
    nom = data.get('nom')
    contact = data.get('contact')
    adresse = data.get('adresse')

    if not nom:
        return jsonify({'erreur': 'Le champ nom est obligatoire'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        # Compter les fournisseurs
        cur.execute("SELECT COUNT(*) FROM fournisseur")
        count = cur.fetchone()[0]
        reference = f"F{count + 1}"

        # Insérer avec solde = '0,00'
        cur.execute(
            "INSERT INTO fournisseur (nom, solde, reference, contact, adresse) VALUES (%s, %s, %s, %s, %s) RETURNING numero_fou",
            (nom, '0,00', reference, contact, adresse)
        )
        fournisseur_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Fournisseur ajouté', 'id': fournisseur_id, 'reference': reference}), 201
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500

@app.route('/supprimer_fournisseur/<numero_fou>', methods=['DELETE'])
def supprimer_fournisseur(numero_fou):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM fournisseur WHERE numero_fou = %s", (numero_fou,))
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'erreur': 'Fournisseur non trouvé'}), 404
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Fournisseur supprimé'}), 200
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500

# --- Produits ---
@app.route('/liste_produits', methods=['GET'])
def liste_produits():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT numero_item, bar, designation, qte, prix, prixba, ref 
            FROM item 
            ORDER BY designation
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        produits = []
        for row in rows:
            # Conversion des valeurs texte avec virgule en float pour les calculs
            prix_float = to_dot_decimal(row[4]) if row[4] else 0.0
            prixba_float = to_dot_decimal(row[5]) if row[5] else 0.0
            
            produits.append({
                'NUMERO_ITEM': row[0],
                'BAR': row[1] or '',
                'DESIGNATION': row[2] or '',
                'QTE': int(row[3]) if row[3] is not None else 0,  # Champ numérique
                'PRIX': row[4] if row[4] else '0,00',  # Champ texte tel quel
                'PRIXBA': row[5] if row[5] else '0,00',  # Champ texte tel quel
                'REF': row[6] or '',
                # Valeurs converties pour les calculs (facultatif)
                'PRIX_NUM': prix_float,
                'PRIXBA_NUM': prixba_float,
                # Formatage standardisé (facultatif)
                'PRIX_FMT': to_comma_decimal(prix_float),
                'PRIXBA_FMT': to_comma_decimal(prixba_float),
                'QTE_FMT': f"{int(row[3]) if row[3] is not None else 0:n}"
            })
        
        return jsonify(produits)
    except Exception as e:
        logger.error(f"Erreur dans liste_produits: {str(e)}")
        return jsonify({'erreur': 'Une erreur est survenue lors de la récupération des produits'}), 500
@app.route('/modifier_item/<numero_item>', methods=['PUT'])
def modifier_item(numero_item):
    if not request.is_json:
        return jsonify({'erreur': 'Le contenu doit être au format JSON'}), 400

    try:
        data = request.get_json()
        designation = data.get('designation')  # Correction de l'orthographe
        bar = data.get('bar')
        prix = data.get('prix')
        qte = data.get('qte')
        prixba = data.get('prixba')

        # Validation des champs obligatoires
        if not all([designation, bar, prix is not None, qte is not None]):
            return jsonify({'erreur': 'Champs obligatoires manquants (designation, bar, prix, qte)'}), 400

        # Conversion des valeurs
        try:
            prix_float = to_dot_decimal(prix) if prix else 0.0
            qte_float = to_dot_decimal(qte) if qte else 0.0  # Conversion en float pour qte
            prix_str = to_comma_decimal(prix_float)
            prixba_str = to_comma_decimal(prixba) if prixba else "0,00"
        except (ValueError, TypeError) as conv_error:
            return jsonify({'erreur': f'Format numérique invalide: {str(conv_error)}'}), 400

        if prix_float < 0 or qte_float < 0:
            return jsonify({'erreur': 'Le prix et la quantité doivent être positifs'}), 400

        conn = None
        cur = None
        try:
            conn = get_conn()
            conn.autocommit = False
            cur = conn.cursor()

            # Vérification unicité code-barres
            cur.execute("SELECT 1 FROM item WHERE bar = %s AND numero_item != %s", (bar, numero_item))
            if cur.fetchone():
                return jsonify({'erreur': 'Ce code-barres est déjà utilisé par un autre produit'}), 409

            # Mise à jour du produit
            cur.execute(
                """UPDATE item SET 
                    designation = %s,
                    bar = %s,
                    prix = %s,
                    qte = %s,
                    prixba = %s,
                    prixb = %s,
                    prixvh = %s
                WHERE numero_item = %s
                RETURNING numero_item""",
                (designation, bar, prix_str, qte_float, prixba_str, prixba_str, prix_str, numero_item)
            )

            if cur.rowcount == 0:
                return jsonify({'erreur': 'Produit non trouvé'}), 404

            conn.commit()
            return jsonify({
                'statut': 'Produit modifié avec succès',
                'numero_item': numero_item,
                'qte': qte_float  # Retourne la valeur décimale
            }), 200

        except psycopg2.Error as db_error:
            if conn:
                conn.rollback()
            logger.error(f"Erreur DB: {str(db_error)}")
            return jsonify({'erreur': 'Erreur de base de données'}), 500
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    except Exception as e:
        logger.error(f"Erreur inattendue: {str(e)}", exc_info=True)
        return jsonify({'erreur': 'Erreur serveur interne'}), 500
# Calcul du chiffre de contrôle EAN-13
def calculate_ean13_check_digit(code12):
    """Calcule le chiffre de contrôle pour un code EAN-13 à partir d'un code de 12 chiffres."""
    digits = [int(d) for d in code12]
    odd_sum = sum(digits[0::2])
    even_sum = sum(digits[1::2])
    total = odd_sum * 3 + even_sum
    next_multiple_of_10 = (total + 9) // 10 * 10
    check_digit = next_multiple_of_10 - total
    return check_digit


@app.route('/ajouter_item', methods=['POST'])
def ajouter_item():
    data = request.get_json()
    designation = data.get('designation')  # Note: Il y a une faute de frappe ici ('designation' vs 'designation')
    bar = data.get('bar')
    prix = data.get('prix')
    qte = data.get('qte')
    prixba = data.get('prixba')

    if not all([designation, prix is not None, qte is not None]):  # Corriger 'designation' ici aussi
        return jsonify({'erreur': 'Champs obligatoires manquants (designation, prix, qte)'}), 400

    try:
        # Conversion des valeurs
        prix_float = to_dot_decimal(prix)  # Convertit en float
        qte_int = int(qte) if qte else 0
        prixba_str = to_comma_decimal(prixba) if prixba is not None else "0,00"

        if prix_float < 0 or qte_int < 0:
            return jsonify({'erreur': 'Le prix et la quantité doivent être positifs'}), 400

        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # Verrouiller pour éviter les conflits
        cur.execute("LOCK TABLE item IN EXCLUSIVE MODE")

        # Si bar est fourni, vérifier son unicité
        if bar:
            cur.execute("SELECT 1 FROM item WHERE bar = %s", (bar,))
            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({'erreur': 'Ce code-barres existe déjà'}), 409

            # Vérifier si le code-barres existe dans la table codebar
            cur.execute("SELECT 1 FROM codebar WHERE bar2 = %s", (bar,))
            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({'erreur': 'Ce code-barres existe déjà comme code-barres lié'}), 409

        # Trouver le prochain numéro disponible pour ref et bar
        cur.execute("SELECT ref, bar FROM item ORDER BY ref")
        existing_items = cur.fetchall()
        used_numbers = []
        for item in existing_items:
            ref_num = int(item['ref'][1:]) if item['ref'].startswith('P') and item['ref'][1:].isdigit() else 0
            bar_num = int(item['bar'][1:12]) if item['bar'].startswith('1') and len(item['bar']) == 13 and item['bar'][1:12].isdigit() else 0
            used_numbers.append(max(ref_num, bar_num))

        next_number = 1
        used_numbers = sorted(set(used_numbers))
        for num in used_numbers:
            if num == next_number:
                next_number += 1
            elif num > next_number:
                break

        ref = f"P{next_number}"

        temp_bar = bar if bar else 'TEMP_BAR'
        cur.execute(
            """INSERT INTO item (
                designation, bar, prix, qte, prixba, ref,
                gere, prixb, tva, disponible, tvav, prixvh, qtea
            ) VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s
            ) RETURNING numero_item""",
            (
                designation, temp_bar, to_comma_decimal(prix_float), qte_int, prixba_str, ref,
                True, prixba_str, 0, True, "0", to_comma_decimal(prix_float), 0
            )
        )
        item_id = cur.fetchone()['numero_item']

        if not bar:
            code12 = f"1{next_number:011d}"
            check_digit = calculate_ean13_check_digit(code12)
            bar = f"{code12}{check_digit}"

            cur.execute("SELECT 1 FROM item WHERE bar = %s AND numero_item != %s", (bar, item_id))
            if cur.fetchone():
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({'erreur': 'Le code EAN-13 généré existe déjà'}), 409

            cur.execute("SELECT 1 FROM codebar WHERE bar2 = %s", (bar,))
            if cur.fetchone():
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({'erreur': 'Le code EAN-13 généré existe déjà comme code-barres lié'}), 409

            cur.execute(
                "UPDATE item SET bar = %s WHERE numero_item = %s",
                (bar, item_id)
            )

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Item ajouté', 'id': item_id, 'ref': ref, 'bar': bar}), 201
    except ValueError:
        conn.rollback()
        return jsonify({'erreur': 'Le prix et la quantité doivent être des nombres valides'}), 400
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        return jsonify({'erreur': str(e)}), 500

@app.route('/supprimer_item/<numero_item>', methods=['DELETE'])
def supprimer_item(numero_item):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM item WHERE numero_item = %s", (numero_item,))
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'erreur': 'Produit non trouvé'}), 404
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Produit supprimé'}), 200
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500




@app.route('/valider_vente', methods=['POST'])
def valider_vente():
    conn = None
    cur = None
    
    try:
        # 1. Validation et conversion des données
        data = request.get_json()
        if not data or not all(k in data for k in ['lignes', 'numero_util', 'password2']):
            logger.error("Données manquantes")
            return jsonify({"error": "Données manquantes"}), 400

        # Conversion des nombres avec virgule
        numero_table = int(data.get('numero_table', 0))
        payment_mode = data.get('payment_mode', 'espece')
        amount_paid = to_dot_decimal(data.get('amount_paid', '0,00'))  # Convertit en float avec point
        amount_paid_str = to_comma_decimal(amount_paid)  # Convertit en string avec virgule
        numero_util = data['numero_util']
        password2 = data['password2']
        nature = "TICKET" if numero_table == 0 else "BON DE L."

        # 2. Connexion et vérification utilisateur
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        conn.autocommit = False

        cur.execute("SELECT password2 FROM utilisateur WHERE numero_util = %s", (numero_util,))
        user = cur.fetchone()
        if not user or user['password2'] != password2:
            logger.error("Authentification invalide")
            return jsonify({"error": "Authentification invalide"}), 401

        # 3. Création de la commande
        cur.execute("""
            INSERT INTO comande (
                numero_table, date_comande, etat_c, nature, 
                connection1, compteur, numero_util
            ) VALUES (
                %s, NOW(), 'Cloture', %s, 
                -1, 
                (SELECT COALESCE(MAX(compteur),0)+1 FROM comande WHERE nature = %s), 
                %s
            ) RETURNING numero_comande
        """, (numero_table, nature, nature, numero_util))
        numero_comande = cur.fetchone()['numero_comande']

        # 4. Traitement des lignes et calcul du total
        total_vente = 0.0
        for ligne in data['lignes']:
            quantite = to_dot_decimal(ligne.get('quantite', '1'))
            remarque = to_dot_decimal(ligne.get('remarque', '0,00'))  # Prix unitaire
            prixt = to_dot_decimal(ligne.get('prixt', '0,00'))  # Total de la ligne
            total_vente += quantite * remarque  # Calcul avec prix unitaire

            # Conversion pour stockage avec virgule
            prixt_str = to_comma_decimal(prixt)
            prixbh_str = to_comma_decimal(to_dot_decimal(ligne.get('prixbh', '0,00')))

            # Gestion de la remarque pour stockage
            remarque_str = ligne.get('remarque', '')
            if isinstance(remarque_str, (int, float)):
                remarque_str = to_comma_decimal(remarque_str)
            elif isinstance(remarque_str, str) and any(c.isdigit() for c in remarque_str):
                try:
                    if '.' in remarque_str or ',' in remarque_str:
                        remarque_str = to_comma_decimal(to_dot_decimal(remarque_str))
                except ValueError:
                    pass  # Garder la valeur originale si conversion échoue

            cur.execute("""
                INSERT INTO attache (
                    numero_comande, numero_item, quantite, prixt,
                    remarque, prixbh, achatfx, send
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                numero_comande,
                ligne['numero_item'],
                quantite,
                prixt_str,  # Stocké avec virgule
                remarque_str,  # Utiliser remarque_str formaté
                prixbh_str,  # Stocké avec virgule
                0,
                True
            ))
            cur.execute("UPDATE item SET qte = qte - %s WHERE numero_item = %s", 
                        (quantite, ligne['numero_item']))

        # Conversion du total pour stockage
        total_vente_str = to_comma_decimal(total_vente)
        montant_reglement = total_vente if payment_mode == 'espece' else amount_paid
        montant_reglement_str = to_comma_decimal(montant_reglement)
        solde_restant = total_vente - amount_paid if payment_mode == 'a_terme' else 0.0
        solde_restant_str = to_comma_decimal(solde_restant)

        # 6. Insertion dans encaisse (valeurs stockées avec virgule)
        now = datetime.now()
        cur.execute("""
            INSERT INTO encaisse (
                apaye, reglement, tva, ht, 
                numero_comande, origine, time_enc, soldeR
            ) VALUES (
                %s, %s, %s, %s, 
                %s, %s, %s, %s
            )
        """, (
            total_vente_str,        # apaye stocké avec virgule
            montant_reglement_str,  # reglement stocké avec virgule
            '0,00',                 # TVA (ajuste si nécessaire)
            total_vente_str,        # HT = total_vente
            numero_comande,
            nature,
            now,
            solde_restant_str       # Solde restant avec virgule
        ))

        # 7. Mise à jour du solde client si à terme (stocké avec virgule)
        if payment_mode == 'a_terme' and numero_table != 0:
            cur.execute("""
                UPDATE client 
                SET solde = to_char((CAST(REPLACE(solde, ',', '.') AS NUMERIC) + %s), 'FM999999999.99')
                WHERE numero_clt = %s
            """, (solde_restant, numero_table))

        conn.commit()
        return jsonify({
            "success": True,
            "numero_comande": numero_comande,
            "total_vente": total_vente_str,  # Renvoyé avec virgule
            "montant_verse": amount_paid_str,  # Renvoyé avec virgule
            "reglement": montant_reglement_str,  # Renvoyé avec virgule
            "solde_restant": solde_restant_str if payment_mode == 'a_terme' else "0,00"
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Erreur: {str(e)}")
        return jsonify({
            "error": "Erreur de traitement",
            "details": str(e)
        }), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
@app.route('/client_solde', methods=['GET'])
def client_solde():
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT numero_clt, COALESCE(solde, '0.00') as solde FROM client")
        soldes = cur.fetchall()
        print(f"Soldes récupérés: {len(soldes)} clients")
        return jsonify(soldes), 200
    except Exception as e:
        print(f"Erreur récupération soldes: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            cur.close()
            conn.close()


@app.route('/ventes_jour', methods=['GET'])
def ventes_jour():
    selected_date = request.args.get('date')
    numero_clt = request.args.get('numero_clt')
    numero_util = request.args.get('numero_util')
    
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        if selected_date:
            try:
                date_obj = datetime.strptime(selected_date, '%Y-%m-%d')
                date_start = date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
                date_end = date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
            except ValueError:
                return jsonify({'erreur': 'Format de date invalide (attendu: YYYY-MM-DD)'}), 400
        else:
            date_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            date_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
        
        query = """
            SELECT
                c.numero_comande,
                c.date_comande,
                c.nature,
                c.numero_table,
                cl.nom AS client_nom,
                c.numero_util,
                u.nom AS utilisateur_nom,
                a.numero_item,
                a.quantite,
                CAST(COALESCE(NULLIF(REPLACE(a.prixt, ',', '.'), ''), '0') AS FLOAT) AS prixt,
                a.remarque,
                i.designation
            FROM comande c
            LEFT JOIN client cl ON c.numero_table = cl.numero_clt
            LEFT JOIN utilisateur u ON c.numero_util = u.numero_util
            JOIN attache a ON c.numero_comande = a.numero_comande
            JOIN item i ON a.numero_item = i.numero_item
            WHERE c.date_comande >= %s
            AND c.date_comande <= %s
        """
        params = [date_start, date_end]
        
        if numero_clt:
            if numero_clt == '0':
                query += " AND c.numero_table = 0"
            else:
                query += " AND c.numero_table = %s"
                params.append(int(numero_clt))
        
        if numero_util:
            if numero_util == '0':
                pass
            else:
                query += " AND c.numero_util = %s"
                params.append(int(numero_util))
        
        query += " ORDER BY c.numero_comande DESC"
        cur.execute(query, params)
        rows = cur.fetchall()
        
        tickets = []
        bons = []
        total = 0.0
        ventes_map = {}
        
        for row in rows:
            if row['numero_comande'] not in ventes_map:
                ventes_map[row['numero_comande']] = {
                    'numero_comande': row['numero_comande'],
                    'date_comande': row['date_comande'].isoformat(),
                    'nature': row['nature'],
                    'client_nom': 'Comptoir' if row['numero_table'] == 0 else row['client_nom'],
                    'utilisateur_nom': row['utilisateur_nom'] or 'N/A',
                    'lignes': []
                }
            
            ventes_map[row['numero_comande']]['lignes'].append({
                'numero_item': row['numero_item'],
                'designation': row['designation'],
                'quantite': row['quantite'],
                'prixt': str(row['prixt']),
                'remarque': row['remarque'] or ''
            })
            
            total += float(row['prixt'])
        
        for vente in ventes_map.values():
            if vente['nature'] == 'TICKET':
                tickets.append(vente)
            elif vente['nature'] == 'BON DE L.':
                bons.append(vente)
        
        cur.close()
        conn.close()
        
        return jsonify({
            'tickets': tickets,
            'bons': bons,
            'total': f"{total:.2f}"
        }), 200
    
    except Exception as e:
        if conn:
            cur.close()
            conn.close()
        print(f"Erreur récupération ventes du jour: {str(e)}")
        return jsonify({'erreur': str(e)}), 500
        

@app.route('/articles_plus_vendus', methods=['GET'])
def articles_plus_vendus():
    selected_date = request.args.get('date')
    numero_clt = request.args.get('numero_clt')
    numero_util = request.args.get('numero_util')
    conn = None
    
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        if selected_date:
            try:
                date_obj = datetime.strptime(selected_date, '%Y-%m-%d')
                date_start = date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
                date_end = date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
            except ValueError:
                return jsonify({'erreur': 'Format de date invalide (attendu: YYYY-MM-DD)'}), 400
        else:
            date_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            date_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
        
        query = """
            SELECT
                i.numero_item,
                i.designation,
                SUM(a.quantite) AS quantite,
                SUM(CAST(COALESCE(NULLIF(REPLACE(a.prixt, ',', '.'), ''), '0') AS FLOAT)) AS total_vente
            FROM comande c
            JOIN attache a ON c.numero_comande = a.numero_comande
            JOIN item i ON a.numero_item = i.numero_item
            WHERE c.date_comande >= %s
            AND c.date_comande <= %s
        """
        params = [date_start, date_end]
        
        if numero_clt:
            if numero_clt == '0':
                query += " AND c.numero_table = 0"
            else:
                query += " AND c.numero_table = %s"
                params.append(int(numero_clt))
        
        if numero_util and numero_util != '0':
            query += " AND c.numero_util = %s"
            params.append(int(numero_util))
        
        query += """
            GROUP BY i.numero_item, i.designation
            ORDER BY quantite DESC
            LIMIT 10
        """
        cur.execute(query, params)
        rows = cur.fetchall()
        
        articles = [
            {
                'numero_item': row['numero_item'],
                'designation': row['designation'] or 'N/A',
                'quantite': int(row['quantite'] or 0),
                'total_vente': f"{float(row['total_vente'] or 0):.2f}"
            }
            for row in rows
        ]
        
        return jsonify(articles), 200
    
    except Exception as e:
        print(f"Erreur récupération articles plus vendus: {str(e)}")
        return jsonify({'erreur': str(e)}), 500
    
    finally:
        if conn:
            cur.close()
            conn.close()

@app.route('/profit_by_date', methods=['GET'])
def profit_by_date():
    selected_date = request.args.get('date')
    numero_clt = request.args.get('numero_clt')
    numero_util = request.args.get('numero_util', '0')
    conn = None
    
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        if selected_date:
            try:
                date_obj = datetime.strptime(selected_date, '%Y-%m-%d')
                date_start = date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
                date_end = date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
            except ValueError:
                return jsonify({'erreur': 'Format de date invalide (attendu: YYYY-MM-DD)'}), 400
        else:
            date_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
            date_start = date_end - timedelta(days=30)
        
        query = """
            SELECT
                DATE(c.date_comande) AS date,
                SUM(CAST(COALESCE(NULLIF(REPLACE(a.prixt, ',', '.'), ''), '0') AS FLOAT) -
                    (a.quantite * CAST(COALESCE(NULLIF(REPLACE(i.prixba, ',', '.'), ''), '0') AS FLOAT))) AS profit
            FROM comande c
            JOIN attache a ON c.numero_comande = a.numero_comande
            JOIN item i ON a.numero_item = i.numero_item
            WHERE c.date_comande >= %s
            AND c.date_comande <= %s
        """
        params = [date_start, date_end]
        
        if numero_clt:
            if numero_clt == '0':
                query += " AND c.numero_table = 0"
            else:
                query += " AND c.numero_table = %s"
                params.append(int(numero_clt))
        
        if numero_util != '0':
            query += " AND c.numero_util = %s"
            params.append(int(numero_util))
        
        query += """
            GROUP BY DATE(c.date_comande)
            ORDER BY DATE(c.date_comande) DESC
        """
        cur.execute(query, params)
        rows = cur.fetchall()
        
        profits = [
            {
                'date': row['date'].strftime('%Y-%m-%d'),
                'profit': f"{float(row['profit'] or 0):.2f}"
            }
            for row in rows
        ]
        
        return jsonify(profits), 200
    
    except Exception as e:
        print(f"Erreur récupération profit par date: {str(e)}")
        return jsonify({'erreur': str(e)}), 500
    
    finally:
        if conn:
            cur.close()
            conn.close()
            
@app.route('/dashboard', methods=['GET'])
def dashboard():
    period = request.args.get('period', 'day')
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        if period == 'week':
            date_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
            date_start = (datetime.now() - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            date_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            date_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)

        # Fonction pour convertir les nombres avec virgule en float
        def parse_decimal(value):
            if value is None or value == '':
                return 0.0
            try:
                # Remplace les virgules par des points et convertit en float
                return float(str(value).replace(',', '.'))
            except:
                return 0.0

        query_kpi = """
            SELECT 
                COALESCE(SUM(CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS NUMERIC)), 0) AS total_ca,
                COALESCE(SUM(
                    CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS NUMERIC) - 
                    (a.quantite * CAST(REPLACE(COALESCE(NULLIF(i.prixba, ''), '0'), ',', '.') AS NUMERIC))
                ), 0) AS total_profit,
                COUNT(DISTINCT c.numero_comande) AS sales_count
            FROM comande c
            JOIN attache a ON c.numero_comande = a.numero_comande
            JOIN item i ON a.numero_item = i.numero_item
            WHERE c.date_comande >= %s
            AND c.date_comande <= %s
        """
        cur.execute(query_kpi, (date_start, date_end))
        kpi_data = cur.fetchone()

        cur.execute("SELECT COUNT(*) AS low_stock FROM item WHERE qte < 10")
        low_stock_count = cur.fetchone()['low_stock']

        query_top_client = """
            SELECT 
                cl.nom,
                COALESCE(SUM(CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS NUMERIC)), 0) AS client_ca
            FROM comande c
            JOIN attache a ON c.numero_comande = a.numero_comande
            LEFT JOIN client cl ON c.numero_table = cl.numero_clt
            WHERE c.date_comande >= %s
            AND c.date_comande <= %s
            GROUP BY cl.nom
            ORDER BY client_ca DESC
            LIMIT 1
        """
        cur.execute(query_top_client, (date_start, date_end))
        top_client = cur.fetchone()

        query_chart = """
            SELECT 
                DATE(c.date_comande) AS sale_date,
                COALESCE(SUM(CAST(REPLACE(COALESCE(NULLIF(a.prixt, ''), '0'), ',', '.') AS NUMERIC)), 0) AS daily_ca
            FROM comande c
            JOIN attache a ON c.numero_comande = a.numero_comande
            WHERE c.date_comande >= %s
            AND c.date_comande <= %s
            GROUP BY DATE(c.date_comande)
            ORDER BY sale_date
        """
        cur.execute(query_chart, (date_start, date_end))
        chart_data = cur.fetchall()

        cur.close()
        conn.close()

        chart_labels = []
        chart_values = []
        current_date = date_start
        while current_date <= date_end:
            chart_labels.append(current_date.strftime('%Y-%m-%d'))
            daily_ca = next((parse_decimal(row['daily_ca']) for row in chart_data 
                           if row['sale_date'].strftime('%Y-%m-%d') == current_date.strftime('%Y-%m-%d')), 0)
            chart_values.append(daily_ca)
            current_date += timedelta(days=1)

        return jsonify({
            'total_ca': float(kpi_data['total_ca'] or 0),
            'total_profit': float(kpi_data['total_profit'] or 0),
            'sales_count': int(kpi_data['sales_count'] or 0),
            'low_stock_items': int(low_stock_count or 0),
            'top_client': {
                'name': top_client['nom'] if top_client else 'N/A',
                'ca': float(top_client['client_ca'] or 0) if top_client else 0
            },
            'chart_data': {
                'labels': chart_labels,
                'values': chart_values
            }
        }), 200

    except Exception as e:
        if conn:
            cur.close()
            conn.close()
        print(f"Erreur récupération KPI: {str(e)}")
        return jsonify({'erreur': str(e)}), 500
        
@app.route('/liste_utilisateurs', methods=['GET'])
def liste_utilisateurs():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT numero_util, nom, statue FROM utilisateur ORDER BY nom")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        utilisateurs = [
            {
                'numero': row[0],
                'nom': row[1],
                'statut': row[2]
            }
            for row in rows
        ]
        return jsonify(utilisateurs)
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500

@app.route('/modifier_utilisateur/<int:numero_util>', methods=['PUT'])
def modifier_utilisateur(numero_util):
    data = request.get_json()
    nom = data.get('nom')
    password2 = data.get('password2')
    statue = data.get('statue')

    if not all([nom, statue]):
        return jsonify({'erreur': 'Champs obligatoires manquants (nom, statue)'}), 400

    if statue not in ['admin', 'emplo']:
        return jsonify({'erreur': 'Statue invalide (doit être "admin" ou "emplo")'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        if password2:
            cur.execute(
                "UPDATE utilisateur SET nom = %s, password2 = %s, statue = %s WHERE numero_util = %s",
                (nom, password2, statue, numero_util)
            )
        else:
            cur.execute(
                "UPDATE utilisateur SET nom = %s, statue = %s WHERE numero_util = %s",
                (nom, statue, numero_util)
            )
        if cur.rowcount == 0:
            return jsonify({'erreur': 'Utilisateur non trouvé'}), 404
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Utilisateur modifié'}), 200
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500

@app.route('/ajouter_utilisateur', methods=['POST'])
def ajouter_utilisateur():
    data = request.get_json()
    nom = data.get('nom')
    password2 = data.get('password2')
    statue = data.get('statue')

    if not all([nom, password2, statue]):
        return jsonify({'erreur': 'Champs obligatoires manquants (nom, password2, statue)'}), 400

    if statue not in ['admin', 'emplo']:
        return jsonify({'erreur': 'Statue invalide (doit être "admin" ou "emplo")'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO utilisateur (nom, password2, statue) VALUES (%s, %s, %s) RETURNING numero_util",
            (nom, password2, statue)
        )
        numero_util = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Utilisateur ajouté', 'id': numero_util}), 201
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500

@app.route('/supprimer_utilisateur/<numero_util>', methods=['DELETE'])
def supprimer_utilisateur(numero_util):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM utilisateur WHERE numero_util = %s", (numero_util,))
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'erreur': 'Utilisateur non trouvé'}), 404
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'statut': 'Utilisateur supprimé'}), 200
    except Exception as e:
        return jsonify({'erreur': str(e)}), 500



@app.route('/stock_value', methods=['GET'])
def valeur_stock():
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # Calculer la valeur du stock en excluant les articles avec qte négative
        cur.execute("""
            SELECT 
                SUM(COALESCE(CAST(NULLIF(REPLACE(prixb, ',', '.'), '') AS FLOAT), 0) * COALESCE(qte, 0)) AS valeur_achat,
                SUM(COALESCE(CAST(NULLIF(REPLACE(prix, ',', '.'), '') AS FLOAT), 0) * COALESCE(qte, 0)) AS valeur_vente
            FROM item
            WHERE qte >= 0 AND GERE=TRUE
        """)
        result = cur.fetchone()

        # Extraire les valeurs et convertir en float
        valeur_achat = to_dot_decimal(result['valeur_achat'] or '0,00')
        valeur_vente = to_dot_decimal(result['valeur_vente'] or '0,00')

        # Calculer la zakat (2,5% de la valeur de vente)
        zakat = valeur_vente * 0.025

        # Formater la réponse avec des virgules
        response = {
            'valeur_achat': to_comma_decimal(valeur_achat),
            'valeur_vente': to_comma_decimal(valeur_vente),
            'zakat': to_comma_decimal(zakat)
        }

        logger.info(f"Valeur stock calculée: valeur_achat={to_comma_decimal(valeur_achat)}, valeur_vente={to_comma_decimal(valeur_vente)}, zakat={to_comma_decimal(zakat)}")
        return jsonify(response), 200

    except Exception as e:
        logger.error(f"Erreur récupération valeur stock: {str(e)}")
        return jsonify({'erreur': str(e)}), 500
    finally:
        if conn:
            cur.close()
            conn.close()


@app.route('/valider_reception', methods=['POST'])
def valider_reception():
    data = request.get_json()
    if not data or 'lignes' not in data or not data['lignes'] or 'numero_four' not in data or 'numero_util' not in data or 'password2' not in data:
        print("Erreur: Données de réception invalides")
        return jsonify({"error": "Données de réception invalides, fournisseur, utilisateur ou mot de passe manquant"}), 400

    numero_four = data.get('numero_four')
    numero_util = data.get('numero_util')
    password2 = data.get('password2')
    lignes = data['lignes']
    nature = "Bon de réception"

    conn = None
    try:
        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute("SELECT Password2 FROM utilisateur WHERE numero_util = %s", (numero_util,))
        utilisateur = cur.fetchone()
        if not utilisateur:
            print(f"Erreur: Utilisateur {numero_util} non trouvé")
            return jsonify({"error": "Utilisateur non trouvé"}), 400
        if utilisateur['password2'] != password2:
            print(f"Erreur: Mot de passe incorrect pour l'utilisateur {numero_util}")
            return jsonify({"error": "Mot de passe incorrect"}), 401

        cur.execute("SELECT numero_fou FROM fournisseur WHERE numero_fou = %s", (numero_four,))
        if not cur.fetchone():
            print(f"Erreur: Fournisseur {numero_four} non trouvé")
            return jsonify({"error": "Fournisseur non trouvé"}), 400

        cur.execute("""
            INSERT INTO mouvement (date_m, etat_m, numero_four, refdoc, vers, nature, connection1, numero_util, cheque)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING numero_mouvement
        """, (datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0), "cloture", numero_four, "", "", nature, 0, numero_util, ""))
        numero_mouvement = cur.fetchone()['numero_mouvement']

        cur.execute("UPDATE mouvement SET refdoc = %s WHERE numero_mouvement = %s", 
                    (str(numero_mouvement), numero_mouvement))

        total_cost = 0.0
        for ligne in lignes:
            numero_item = ligne.get('numero_item')
            qtea = float(ligne.get('qtea', '0').replace(',', '.') if isinstance(ligne.get('qtea'), str) else ligne.get('qtea', 0))
            prixbh = float(ligne.get('prixbh', '0').replace(',', '.') if isinstance(ligne.get('prixbh'), str) else ligne.get('prixbh', 0))

            if qtea <= 0:
                raise Exception("La quantité ajoutée doit être positive")

            cur.execute("""
                SELECT qte, CAST(COALESCE(NULLIF(REPLACE(prixba, ',', '.'), ''), '0') AS FLOAT) AS prixba 
                FROM item WHERE numero_item = %s
            """, (numero_item,))
            item = cur.fetchone()
            if not item:
                raise Exception(f"Article {numero_item} non trouvé")

            current_qte = float(item['qte'] or 0)
            prixba = float(item['prixba'] or 0)

            nqte = current_qte + qtea
            total_cost += qtea * prixbh

            prixbh_str = str(prixbh).replace('.', ',')[:30]  # Stocker avec virgule
            prixba_str = str(prixba).replace('.', ',')[:30]  # Stocker avec virgule

            cur.execute("""
                INSERT INTO attache2 (numero_item, numero_mouvement, qtea, nqte, nprix, pump, send)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (numero_item, numero_mouvement, qtea, nqte, prixbh_str, prixba_str, True))

            # Mise à jour du fournisseur pour l'article
            cur.execute("UPDATE item SET qte = %s, prixba = %s, numero_fou = %s WHERE numero_item = %s", 
                        (nqte, prixbh_str, numero_four, numero_item))

        cur.execute("""
            SELECT CAST(COALESCE(NULLIF(REPLACE(solde, ',', '.'), ''), '0') AS FLOAT) AS solde 
            FROM fournisseur WHERE numero_fou = %s
        """, (numero_four,))
        fournisseur = cur.fetchone()
        if not fournisseur:
            raise Exception(f"Fournisseur {numero_four} non trouvé")

        current_solde = float(fournisseur['solde'] or 0)
        new_solde = current_solde - total_cost
        new_solde_str = str(new_solde).replace('.', ',')  # Stocker avec virgule

        cur.execute("UPDATE fournisseur SET solde = %s WHERE numero_fou = %s", 
                    (new_solde_str, numero_four))
        print(f"Solde fournisseur mis à jour: numero_fou={numero_four}, total_cost={total_cost}, new_solde={new_solde_str}")

        conn.commit()
        print(f"Réception validée: numero_mouvement={numero_mouvement}, {len(lignes)} lignes")
        return jsonify({"numero_mouvement": numero_mouvement}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Erreur validation réception: {str(e)}")
        return jsonify({"error": str(e)}), 500

    finally:
        if conn:
            cur.close()
            conn.close()

@app.route('/receptions_jour', methods=['GET'])
def receptions_jour():
    selected_date = request.args.get('date')
    numero_util = request.args.get('numero_util')
    numero_four = request.args.get('numero_four', '')

    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        if selected_date:
            try:
                date_obj = datetime.strptime(selected_date, '%Y-%m-%d')
                date_start = date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
                date_end = date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
            except ValueError:
                return jsonify({'erreur': 'Format de date invalide (attendu: YYYY-MM-DD)'}), 400
        else:
            date_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            date_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)

        query = """
            SELECT 
                m.numero_mouvement,
                m.date_m,
                m.nature,
                m.numero_four,
                f.nom AS fournisseur_nom,
                m.numero_util,
                u.nom AS utilisateur_nom,
                a2.numero_item,
                a2.qtea,
                CAST(COALESCE(NULLIF(REPLACE(a2.nprix, ',', '.'), ''), '0') AS FLOAT) AS nprix,
                i.designation
            FROM mouvement m
            LEFT JOIN fournisseur f ON m.numero_four = f.numero_fou
            LEFT JOIN utilisateur u ON m.numero_util = u.numero_util
            JOIN attache2 a2 ON m.numero_mouvement = a2.numero_mouvement
            JOIN item i ON a2.numero_item = i.numero_item
            WHERE m.date_m >= %s 
            AND m.date_m <= %s
            AND m.nature = 'Bon de réception'
        """
        params = [date_start, date_end]

        if numero_util and numero_util != '0':
            query += " AND m.numero_util = %s"
            params.append(int(numero_util))
        if numero_four and numero_four != '':
            query += " AND m.numero_four = %s"
            params.append(numero_four)

        query += " ORDER BY m.numero_mouvement DESC"

        cur.execute(query, params)
        rows = cur.fetchall()

        receptions = []
        total = 0.0
        receptions_map = {}

        for row in rows:
            nprix = float(row['nprix'])
            total_ligne = float(row['qtea']) * nprix

            if row['numero_mouvement'] not in receptions_map:
                receptions_map[row['numero_mouvement']] = {
                    'numero_mouvement': row['numero_mouvement'],
                    'date_m': row['date_m'].isoformat(),
                    'nature': row['nature'],
                    'fournisseur_nom': row['fournisseur_nom'] or 'N/A',
                    'utilisateur_nom': row['utilisateur_nom'] or 'N/A',
                    'lignes': []
                }

            receptions_map[row['numero_mouvement']]['lignes'].append({
                'numero_item': row['numero_item'],
                'designation': row['designation'],
                'qtea': row['qtea'],
                'nprix': str(nprix).replace('.', ','),  # Retourner avec virgule
                'total_ligne': str(total_ligne).replace('.', ',')  # Retourner avec virgule
            })

            total += total_ligne

        receptions = list(receptions_map.values())

        cur.close()
        conn.close()

        return jsonify({
            'receptions': receptions,
            'total': str(total).replace('.', ',')  # Retourner avec virgule
        }), 200

    except Exception as e:
        if conn:
            cur.close()
            conn.close()
        print(f"Erreur récupération réceptions: {str(e)}")
        return jsonify({'erreur': str(e)}), 500
        
@app.route('/ajouter_versement', methods=['POST'])
def ajouter_versement():
    """
    Ajoute un versement pour un client ou fournisseur avec validation des données et mise à jour du solde.
    """
    # Récupération et validation des données JSON
    data = request.get_json()
    required_fields = ['type', 'numero_cf', 'montant', 'numero_util', 'password2']
    if not data or any(field not in data for field in required_fields):
        print("Erreur: Données de versement invalides")
        return jsonify({"error": "Type, numéro client/fournisseur, montant, utilisateur ou mot de passe manquant"}), 400

    type_versement = data.get('type')
    numero_cf = data.get('numero_cf')
    montant = data.get('montant')
    justificatif = data.get('justificatif', '')
    numero_util = data.get('numero_util')
    password2 = data.get('password2')

    # Validation du type de versement
    if type_versement not in ['C', 'F']:
        return jsonify({"error": "Type invalide (doit être 'C' ou 'F')"}), 400

    # Connexion à la base de données
    conn = None
    cur = None
    try:
        # Conversion du montant avec to_dot_decimal
        montant = to_dot_decimal(montant)
        if montant == 0:
            return jsonify({"error": "Le montant ne peut pas être zéro"}), 400

        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Vérification de l'utilisateur et du mot de passe
        cur.execute("SELECT Password2 FROM utilisateur WHERE numero_util = %s", (numero_util,))
        utilisateur = cur.fetchone()
        if not utilisateur:
            print(f"Erreur: Utilisateur {numero_util} non trouvé")
            return jsonify({"error": "Utilisateur non trouvé"}), 400
        if utilisateur['password2'] != password2:
            print(f"Erreur: Mot de passe incorrect pour l'utilisateur {numero_util}")
            return jsonify({"error": "Mot de passe incorrect"}), 401

        # Sélection des informations selon le type (client ou fournisseur)
        if type_versement == 'C':
            cur.execute("SELECT solde FROM client WHERE numero_clt = %s", (numero_cf,))
            entity = cur.fetchone()
            table = 'client'
            id_column = 'numero_clt'
            origine = 'VERSEMENT C'
        else:
            cur.execute("SELECT solde FROM fournisseur WHERE numero_fou = %s", (numero_cf,))
            entity = cur.fetchone()
            table = 'fournisseur'
            id_column = 'numero_fou'
            origine = 'VERSEMENT F'

        if not entity:
            print(f"Erreur: {'Client' if type_versement == 'C' else 'Fournisseur'} {numero_cf} non trouvé")
            return jsonify({"error": f"{'Client' if type_versement == 'C' else 'Fournisseur'} non trouvé"}), 400

        # Mise à jour du solde
        current_solde = to_dot_decimal(entity['solde'] or '0,00')
        new_solde = current_solde + montant
        new_solde_str = to_comma_decimal(new_solde)  # Formatage pour la base de données

        cur.execute(f"UPDATE {table} SET solde = %s WHERE {id_column} = %s",
                    (new_solde_str, numero_cf))

        # Enregistrement du mouvement
        now = datetime.utcnow()
        cur.execute(
            """
            INSERT INTO MOUVEMENTC (date_mc, time_mc, montant, justificatif, numero_util, origine, cf, numero_cf)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING numero_mc
            """,
            (now.date(), now, to_comma_decimal(montant), justificatif,
             numero_util, origine, type_versement, numero_cf)
        )
        numero_mc = cur.fetchone()['numero_mc']

        conn.commit()
        print(f"Versement ajouté: numero_mc={numero_mc}, type={type_versement}, montant={to_comma_decimal(montant)}")
        return jsonify({"numero_mc": numero_mc, "statut": "Versement ajouté"}), 201

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Erreur ajout versement: {str(e)}")
        return jsonify({"error": str(e)}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
@app.route('/historique_versements', methods=['GET'])
def historique_versements():
    selected_date = request.args.get('date')
    type_versement = request.args.get('type')

    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        if selected_date:
            try:
                date_obj = datetime.strptime(selected_date, '%Y-%m-%d')
                date_start = date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
                date_end = date_obj.replace(hour=23, minute=59, second=59, microsecond=999999)
            except ValueError:
                return jsonify({'erreur': 'Format de date invalide (attendu: YYYY-MM-DD)'}), 400
        else:
            date_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            date_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)

        query = """
            SELECT 
                mc.numero_mc,
                mc.date_mc,
                mc.montant,
                mc.justificatif,
                mc.cf,
                mc.numero_cf,
                mc.numero_util,
                COALESCE(cl.nom, f.nom) AS nom_cf,
                u.nom AS utilisateur_nom
            FROM MOUVEMENTC mc
            LEFT JOIN client cl ON mc.cf = 'C' AND mc.numero_cf = cl.numero_clt
            LEFT JOIN fournisseur f ON mc.cf = 'F' AND mc.numero_cf = f.numero_fou
            LEFT JOIN utilisateur u ON mc.numero_util = u.numero_util
            WHERE mc.date_mc >= %s
            AND mc.date_mc <= %s
            AND mc.origine IN ('VERSEMENT C', 'VERSEMENT F')
        """
        params = [date_start, date_end]

        if type_versement in ['C', 'F']:
            query += " AND mc.cf = %s"
            params.append(type_versement)

        query += " ORDER BY mc.date_mc DESC, mc.time_mc DESC"

        cur.execute(query, params)
        rows = cur.fetchall()

        versements = [
            {
                'numero_mc': row['numero_mc'],
                'date_mc': row['date_mc'].strftime('%Y-%m-%d'),
                'montant': str(row['montant']),
                'justificatif': row['justificatif'] or '',
                'type': 'Client' if row['cf'] == 'C' else 'Fournisseur',
                'numero_cf': row['numero_cf'],
                'nom_cf': row['nom_cf'] or 'N/A',
                'utilisateur_nom': row['utilisateur_nom'] or 'N/A'
            }
            for row in rows
        ]

        cur.close()
        conn.close()
        return jsonify(versements), 200

    except Exception as e:
        if conn:
            cur.close()
            conn.close()
        print(f"Erreur récupération historique versements: {str(e)}")
        return jsonify({'erreur': str(e)}), 500



@app.route('/annuler_versement', methods=['DELETE'])
def annuler_versement():
    """
    Annule un versement existant pour un client ou fournisseur avec mise à jour du solde.
    """
    # Récupération et validation des données JSON
    data = request.get_json()
    required_fields = ['numero_mc', 'type', 'numero_cf', 'numero_util', 'password2']
    if not data or any(field not in data for field in required_fields):
        print("Erreur: Données d'annulation invalides")
        return jsonify({"error": "Numéro de versement, type, numéro client/fournisseur, utilisateur ou mot de passe manquant"}), 400

    numero_mc = data.get('numero_mc')
    type_versement = data.get('type')
    numero_cf = data.get('numero_cf')
    numero_util = data.get('numero_util')
    password2 = data.get('password2')

    # Validation du type de versement
    if type_versement not in ['C', 'F']:
        return jsonify({"error": "Type invalide (doit être 'C' ou 'F')"}), 400

    # Connexion à la base de données
    conn = None
    cur = None
    try:
        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Vérification de l'utilisateur et du mot de passe
        cur.execute("SELECT Password2 FROM utilisateur WHERE numero_util = %s", (numero_util,))
        utilisateur = cur.fetchone()
        if not utilisateur:
            print(f"Erreur: Utilisateur {numero_util} non trouvé")
            return jsonify({"error": "Utilisateur non trouvé"}), 400
        if utilisateur['password2'] != password2:
            print(f"Erreur: Mot de passe incorrect pour l'utilisateur {numero_util}")
            return jsonify({"error": "Mot de passe incorrect"}), 401

        # Vérification du versement existant
        cur.execute("SELECT montant, cf, numero_cf FROM MOUVEMENTC WHERE numero_mc = %s AND origine IN ('VERSEMENT C', 'VERSEMENT F')",
                    (numero_mc,))
        versement = cur.fetchone()
        if not versement:
            print(f"Erreur: Versement {numero_mc} non trouvé")
            return jsonify({"error": "Versement non trouvé"}), 404

        # Vérification de la cohérence du type
        if type_versement != versement['cf']:
            print(f"Erreur: Type {type_versement} ne correspond pas au versement {numero_mc}")
            return jsonify({"error": "Type ne correspond pas au versement"}), 400

        # Détermination de la table
        if versement['cf'] == 'C':
            table = 'client'
            id_column = 'numero_clt'
        else:
            table = 'fournisseur'
            id_column = 'numero_fou'

        # Vérification de l'entité (client ou fournisseur)
        cur.execute(f"SELECT solde FROM {table} WHERE {id_column} = %s", (numero_cf,))
        entity = cur.fetchone()
        if not entity:
            print(f"Erreur: {'Client' if versement['cf'] == 'C' else 'Fournisseur'} {numero_cf} non trouvé")
            return jsonify({"error": f"{'Client' if versement['cf'] == 'C' else 'Fournisseur'} non trouvé"}), 400

        # Calcul du nouveau solde
        montant = to_dot_decimal(versement['montant'])
        current_solde = to_dot_decimal(entity['solde'] or '0,00')
        new_solde = current_solde - montant
        new_solde_str = to_comma_decimal(new_solde)

        # Mise à jour du solde
        cur.execute(f"UPDATE {table} SET solde = %s WHERE {id_column} = %s",
                    (new_solde_str, numero_cf))

        # Suppression du versement
        cur.execute("DELETE FROM MOUVEMENTC WHERE numero_mc = %s", (numero_mc,))
        if cur.rowcount == 0:
            conn.rollback()
            print(f"Erreur: Versement {numero_mc} non supprimé")
            return jsonify({"error": "Versement non supprimé"}), 500

        conn.commit()
        print(f"Versement annulé: numero_mc={numero_mc}, type={type_versement}, montant={to_comma_decimal(montant)}")
        return jsonify({"statut": "Versement annulé", "numero_mc": numero_mc}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Erreur annulation versement: {str(e)}")
        return jsonify({"error": str(e)}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route('/modifier_versement', methods=['PUT'])
def modifier_versement():
    """
    Modifie un versement existant pour un client ou fournisseur avec mise à jour du solde.
    """
    # Récupération et validation des données JSON
    data = request.get_json()
    required_fields = ['numero_mc', 'type', 'numero_cf', 'montant', 'numero_util', 'password2']
    if not data or any(field not in data for field in required_fields):
        print("Erreur: Données de modification invalides")
        return jsonify({"error": "Numéro de versement, type, numéro client/fournisseur, montant, utilisateur ou mot de passe manquant"}), 400

    numero_mc = data.get('numero_mc')
    type_versement = data.get('type')
    numero_cf = data.get('numero_cf')
    montant = data.get('montant')
    justificatif = data.get('justificatif', '')
    numero_util = data.get('numero_util')
    password2 = data.get('password2')

    # Validation du type de versement
    if type_versement not in ['C', 'F']:
        return jsonify({"error": "Type invalide (doit être 'C' ou 'F')"}), 400

    # Connexion à la base de données
    conn = None
    cur = None
    try:
        # Conversion du montant avec to_dot_decimal
        montant = to_dot_decimal(montant)
        if montant == 0:
            return jsonify({"error": "Le montant ne peut pas être zéro"}), 400

        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Vérification de l'utilisateur et du mot de passe
        cur.execute("SELECT Password2 FROM utilisateur WHERE numero_util = %s", (numero_util,))
        utilisateur = cur.fetchone()
        if not utilisateur:
            print(f"Erreur: Utilisateur {numero_util} non trouvé")
            return jsonify({"error": "Utilisateur non trouvé"}), 400
        if utilisateur['password2'] != password2:
            print(f"Erreur: Mot de passe incorrect pour l'utilisateur {numero_util}")
            return jsonify({"error": "Mot de passe incorrect"}), 401

        # Vérification du versement existant
        cur.execute("SELECT montant, cf, numero_cf FROM MOUVEMENTC WHERE numero_mc = %s AND origine IN ('VERSEMENT C', 'VERSEMENT F')",
                    (numero_mc,))
        versement = cur.fetchone()
        if not versement:
            print(f"Erreur: Versement {numero_mc} non trouvé")
            return jsonify({"error": "Versement non trouvé"}), 404

        # Détermination de la table et des paramètres
        if versement['cf'] == 'C':
            table = 'client'
            id_column = 'numero_clt'
            origine = 'VERSEMENT C'
        else:
            table = 'fournisseur'
            id_column = 'numero_fou'
            origine = 'VERSEMENT F'

        # Vérification de l'entité (client ou fournisseur)
        cur.execute(f"SELECT solde FROM {table} WHERE {id_column} = %s", (numero_cf,))
        entity = cur.fetchone()
        if not entity:
            print(f"Erreur: {'Client' if versement['cf'] == 'C' else 'Fournisseur'} {numero_cf} non trouvé")
            return jsonify({"error": f"{'Client' if versement['cf'] == 'C' else 'Fournisseur'} non trouvé"}), 400

        # Calcul du nouveau solde
        old_montant = to_dot_decimal(versement['montant'])
        current_solde = to_dot_decimal(entity['solde'] or '0,00')
        solde_change = -old_montant + montant
        new_solde = current_solde + solde_change
        new_solde_str = to_comma_decimal(new_solde)

        # Mise à jour du solde
        cur.execute(f"UPDATE {table} SET solde = %s WHERE {id_column} = %s",
                    (new_solde_str, numero_cf))

        # Mise à jour du versement dans MOUVEMENTC
        now = datetime.utcnow()
        cur.execute("""
            UPDATE MOUVEMENTC 
            SET montant = %s, justificatif = %s, date_mc = %s, time_mc = %s
            WHERE numero_mc = %s AND origine = %s
        """, (to_comma_decimal(montant), justificatif, now.date(), now, numero_mc, origine))

        if cur.rowcount == 0:
            conn.rollback()
            print(f"Erreur: Versement {numero_mc} non modifié")
            return jsonify({"error": "Versement non modifié"}), 500

        conn.commit()
        print(f"Versement modifié: numero_mc={numero_mc}, type={type_versement}, montant={to_comma_decimal(montant)}, justificatif={justificatif}")
        return jsonify({"statut": "Versement modifié", "numero_mc": numero_mc}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Erreur modification versement: {str(e)}")
        return jsonify({"error": str(e)}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# Endpoint: Situation des versements
@app.route('/situation_versements', methods=['GET'])
def situation_versements():
    type_versement = request.args.get('type')  # 'C' ou 'F'
    numero_cf = request.args.get('numero_cf')  # ID du client ou fournisseur

    if not type_versement or type_versement not in ['C', 'F']:
        return jsonify({'erreur': "Paramètre 'type' requis et doit être 'C' ou 'F'"}), 400
    if not numero_cf:
        return jsonify({'erreur': "Paramètre 'numero_cf' requis"}), 400

    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        query = """
            SELECT 
                mc.numero_mc,
                mc.date_mc,
                mc.montant,
                mc.justificatif,
                mc.cf,
                mc.numero_cf,
                mc.numero_util,
                COALESCE(cl.nom, f.nom) AS nom_cf,
                u.nom AS utilisateur_nom
            FROM MOUVEMENTC mc
            LEFT JOIN client cl ON mc.cf = 'C' AND mc.numero_cf = cl.numero_clt
            LEFT JOIN fournisseur f ON mc.cf = 'F' AND mc.numero_cf = f.numero_fou
            LEFT JOIN utilisateur u ON mc.numero_util = u.numero_util
            WHERE mc.origine IN ('VERSEMENT C', 'VERSEMENT F')
            AND mc.cf = %s
            AND mc.numero_cf = %s
            ORDER BY mc.date_mc DESC, mc.time_mc DESC
        """
        params = [type_versement, numero_cf]

        cur.execute(query, params)
        rows = cur.fetchall()

        versements = [
            {
                'numero_mc': row['numero_mc'],
                'date_mc': row['date_mc'].strftime('%Y-%m-%d'),
                'montant': str(row['montant']),
                'justificatif': row['justificatif'] or '',
                'cf': row['cf'],
                'numero_cf': row['numero_cf'],
                'nom_cf': row['nom_cf'] or 'N/A',
                'utilisateur_nom': row['utilisateur_nom'] or 'N/A'
            }
            for row in rows
        ]

        cur.close()
        conn.close()
        logger.info(f"Situation versements: type={type_versement}, numero_cf={numero_cf}, {len(versements)} versements")
        return jsonify(versements), 200

    except Exception as e:
        if conn:
            cur.close()
            conn.close()
        logger.error(f"Erreur récupération situation versements: {str(e)}")
        return jsonify({'erreur': str(e)}), 500

# Endpoint: Annuler une vente


@app.route('/annuler_vente', methods=['POST'])
def annuler_vente():
    # Récupération et validation des données JSON
    data = request.get_json()
    required_fields = ['numero_comande', 'password2']
    if not data or any(field not in data for field in required_fields):
        logger.error(f"Données d'annulation invalides: champs manquants {', '.join(field for field in required_fields if field not in data)}")
        return jsonify({"error": "Numéro de commande ou mot de passe manquant"}), 400

    numero_comande = data.get('numero_comande')
    password2 = data.get('password2')

    # Validation des types
    try:
        numero_comande = int(numero_comande)  # Vérifier que c'est un entier
        if not isinstance(password2, str) or not password2.strip():
            logger.error("Mot de passe invalide (vide ou non-chaîne)")
            return jsonify({"error": "Mot de passe invalide"}), 400
    except (ValueError, TypeError):
        logger.error("Format invalide pour numero_comande")
        return jsonify({"error": "Format invalide pour numero_comande"}), 400

    conn = None
    cur = None
    try:
        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Vérifier l'existence de la commande et récupérer le numero_util
        cur.execute("""
            SELECT c.numero_table, c.nature, c.numero_util 
            FROM comande c
            WHERE c.numero_comande = %s
        """, (numero_comande,))
        commande = cur.fetchone()
        if not commande:
            logger.error(f"Commande {numero_comande} non trouvée")
            return jsonify({"error": "Commande non trouvée"}), 404

        # Vérifier le mot de passe de l'utilisateur associé
        cur.execute("SELECT password2 FROM utilisateur WHERE numero_util = %s", (commande['numero_util'],))
        utilisateur = cur.fetchone()
        if not utilisateur:
            logger.error(f"Utilisateur {commande['numero_util']} non trouvé")
            return jsonify({"error": "Utilisateur associé à la commande non trouvé"}), 400
        if utilisateur['password2'] != password2:
            logger.error(f"Mot de passe incorrect pour la commande {numero_comande}")
            return jsonify({"error": "Mot de passe incorrect"}), 401

        # Récupérer les lignes de la vente
        cur.execute("""
            SELECT numero_item, quantite, prixt
            FROM attache 
            WHERE numero_comande = %s
        """, (numero_comande,))
        lignes = cur.fetchall()
        if not lignes:
            logger.error(f"Aucune ligne trouvée pour la commande {numero_comande}")
            return jsonify({"error": "Aucune ligne de vente trouvée"}), 404

        # Restaurer le stock dans item
        for ligne in lignes:
            cur.execute("""
                UPDATE item 
                SET qte = qte + %s 
                WHERE numero_item = %s
            """, (ligne['quantite'], ligne['numero_item']))

        # Si vente à terme (numero_table != 0), ajuster le solde du client
        if commande['numero_table'] != 0:
            total_sale = sum(to_dot_decimal(ligne['prixt'] or '0,00') for ligne in lignes)
            cur.execute("SELECT solde FROM client WHERE numero_clt = %s", 
                        (commande['numero_table'],))
            client = cur.fetchone()
            if not client:
                logger.error(f"Client {commande['numero_table']} non trouvé")
                raise Exception(f"Client {commande['numero_table']} non trouvé")
            
            current_solde = to_dot_decimal(client['solde'] or '0,00')
            new_solde = current_solde - total_sale  # Réduire la dette (inverser la vente)
            new_solde_str = to_comma_decimal(new_solde)
            
            cur.execute("""
                UPDATE client 
                SET solde = %s 
                WHERE numero_clt = %s
            """, (new_solde_str, commande['numero_table']))
            logger.info(f"Solde client mis à jour: numero_clt={commande['numero_table']}, total_sale={total_sale}, new_solde={new_solde_str}")

        # Supprimer les enregistrements associés dans encaisse
        cur.execute("DELETE FROM encaisse WHERE numero_comande = %s", (numero_comande,))
        logger.info(f"Enregistrements supprimés de la table encaisse pour numero_comande={numero_comande}")

        # Supprimer les lignes de attache
        cur.execute("DELETE FROM attache WHERE numero_comande = %s", (numero_comande,))

        # Supprimer la commande
        cur.execute("DELETE FROM comande WHERE numero_comande = %s", (numero_comande,))

        conn.commit()
        logger.info(f"Vente annulée: numero_comande={numero_comande}, {len(lignes)} lignes")
        return jsonify({"statut": "Vente annulée"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Erreur annulation vente: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@app.route('/annuler_reception', methods=['POST'])
def annuler_reception():
    # Récupération et validation des données JSON
    data = request.get_json()
    required_fields = ['numero_mouvement', 'password2']
    if not data or any(field not in data for field in required_fields):
        logger.error(f"Données d'annulation invalides: champs manquants {', '.join(field for field in required_fields if field not in data)}")
        return jsonify({"error": "Numéro de mouvement ou mot de passe manquant"}), 400

    numero_mouvement = data.get('numero_mouvement')
    password2 = data.get('password2')

    # Validation des types
    try:
        numero_mouvement = int(numero_mouvement)  # Vérifier que c'est un entier
        if not isinstance(password2, str) or not password2.strip():
            logger.error("Mot de passe invalide (vide ou non-chaîne)")
            return jsonify({"error": "Mot de passe invalide"}), 400
    except (ValueError, TypeError):
        logger.error("Format invalide pour numero_mouvement")
        return jsonify({"error": "Format invalide pour numero_mouvement"}), 400

    conn = None
    cur = None
    try:
        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Vérifier l'existence du mouvement et récupérer le numero_util
        cur.execute("""
            SELECT m.numero_four, m.numero_util 
            FROM mouvement m
            WHERE m.numero_mouvement = %s AND m.nature = 'Bon de réception'
        """, (numero_mouvement,))
        mouvement = cur.fetchone()
        if not mouvement:
            logger.error(f"Mouvement {numero_mouvement} non trouvé")
            return jsonify({"error": "Mouvement non trouvé"}), 404

        # Vérifier le mot de passe de l'utilisateur associé
        cur.execute("SELECT password2 FROM utilisateur WHERE numero_util = %s", (mouvement['numero_util'],))
        utilisateur = cur.fetchone()
        if not utilisateur:
            logger.error(f"Utilisateur {mouvement['numero_util']} non trouvé")
            return jsonify({"error": "Utilisateur associé au mouvement non trouvé"}), 400
        if utilisateur['password2'] != password2:
            logger.error(f"Mot de passe incorrect pour le mouvement {numero_mouvement}")
            return jsonify({"error": "Mot de passe incorrect"}), 401

        # Récupérer les lignes de la réception
        cur.execute("""
            SELECT numero_item, qtea, nprix 
            FROM attache2 
            WHERE numero_mouvement = %s
        """, (numero_mouvement,))
        lignes = cur.fetchall()

        if not lignes:
            logger.error(f"Aucune ligne trouvée pour le mouvement {numero_mouvement}")
            return jsonify({"error": "Aucune ligne de réception trouvée"}), 404

        # Calculer le coût total de la réception
        total_cost = sum(to_dot_decimal(ligne['qtea']) * to_dot_decimal(ligne['nprix']) for ligne in lignes)

        # Restaurer le stock dans item
        for ligne in lignes:
            cur.execute("""
                UPDATE item 
                SET qte = qte - %s 
                WHERE numero_item = %s
            """, (to_dot_decimal(ligne['qtea']), ligne['numero_item']))

        # Mettre à jour le solde du fournisseur
        cur.execute("SELECT solde FROM fournisseur WHERE numero_fou = %s", 
                    (mouvement['numero_four'],))
        fournisseur = cur.fetchone()
        if not fournisseur:
            raise Exception(f"Fournisseur {mouvement['numero_four']} non trouvé")

        current_solde = to_dot_decimal(fournisseur['solde'] or '0,00')
        new_solde = current_solde + total_cost  # Inverser l'effet de la réception
        new_solde_str = to_comma_decimal(new_solde)

        cur.execute("""
            UPDATE fournisseur 
            SET solde = %s 
            WHERE numero_fou = %s
        """, (new_solde_str, mouvement['numero_four']))
        logger.info(f"Solde fournisseur mis à jour: numero_fou={mouvement['numero_four']}, total_cost={total_cost}, new_solde={new_solde_str}")

        # Supprimer les lignes de attache2
        cur.execute("DELETE FROM attache2 WHERE numero_mouvement = %s", (numero_mouvement,))

        # Supprimer le mouvement
        cur.execute("DELETE FROM mouvement WHERE numero_mouvement = %s", (numero_mouvement,))

        conn.commit()
        logger.info(f"Réception annulée: numero_mouvement={numero_mouvement}, {len(lignes)} lignes")
        return jsonify({"statut": "Réception annulée"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Erreur annulation réception: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
export async function annulerVente(data) {
  try {
    console.log("Exécution de annulerVente avec data:", data);
    const db = await getDb();

    // 1. Validation des données - mêmes clés que Flask
    if (!data || !data.numero_comande || !data.password2) {
      return { error: "Numéro de commande ou mot de passe manquant", status: 400 };
    }

    const numero_comande = parseInt(data.numero_comande);
    const password2 = data.password2;

    if (isNaN(numero_comande)) {
      return { error: "Format invalide pour numero_comande", status: 400 };
    }

    if (typeof password2 !== 'string' || !password2.trim()) {
      return { error: "Mot de passe invalide", status: 400 };
    }

    db.run("BEGIN TRANSACTION");

    try {
      // 2. Vérifier l'existence de la commande et récupérer le numero_util
      const stmtComande = db.prepare(`
        SELECT numero_table, nature, numero_util 
        FROM comande 
        WHERE numero_comande = ?
      `);
      stmtComande.bind([numero_comande]);
      const commande = stmtComande.step() ? stmtComande.getAsObject() : null;
      stmtComande.free();

      if (!commande) {
        return { error: "Commande non trouvée", status: 404 };
      }

      // 3. Vérifier le mot de passe de l'utilisateur
      const stmtUser = db.prepare("SELECT password2 FROM utilisateur WHERE numero_util = ?");
      stmtUser.bind([commande.numero_util]);
      const utilisateur = stmtUser.step() ? stmtUser.getAsObject() : null;
      stmtUser.free();

      if (!utilisateur) {
        return { error: "Utilisateur associé à la commande non trouvé", status: 400 };
      }

      if (utilisateur.password2 !== password2) {
        return { error: "Mot de passe incorrect", status: 401 };
      }

      // 4. Récupérer les lignes de la vente
      const stmtLignes = db.prepare(`
        SELECT numero_item, quantite, prixt
        FROM attache 
        WHERE numero_comande = ?
      `);
      stmtLignes.bind([numero_comande]);
      
      let ligne;
      const lignes = [];
      while (stmtLignes.step()) {
        ligne = stmtLignes.getAsObject();
        lignes.push(ligne);
      }
      stmtLignes.free();

      if (lignes.length === 0) {
        return { error: "Aucune ligne de vente trouvée", status: 404 };
      }

      // 5. Restaurer le stock dans item
      for (const ligne of lignes) {
        const stmtItem = db.prepare("SELECT qte FROM item WHERE numero_item = ?");
        stmtItem.bind([ligne.numero_item]);
        const item = stmtItem.step() ? stmtItem.getAsObject() : null;
        stmtItem.free();

        if (item) {
          const nouvelleQte = parseInt(item.qte) + parseInt(ligne.quantite);
          db.prepare("UPDATE item SET qte = ? WHERE numero_item = ?")
            .run([nouvelleQte, ligne.numero_item])
            .free();
        }
      }

      // 6. Si vente à terme (numero_table != 0), ajuster le solde du client
      if (commande.numero_table !== 0) {
        const totalVente = lignes.reduce((sum, ligne) => sum + parseFloat(ligne.prixt || 0), 0);
        
        const stmtClient = db.prepare("SELECT solde FROM client WHERE numero_clt = ?");
        stmtClient.bind([commande.numero_table]);
        const client = stmtClient.step() ? stmtClient.getAsObject() : null;
        stmtClient.free();

        if (!client) {
          throw new Error(`Client ${commande.numero_table} non trouvé`);
        }

        const nouveauSolde = parseFloat(client.solde || 0) - totalVente;
        db.prepare("UPDATE client SET solde = ? WHERE numero_clt = ?")
          .run([nouveauSolde.toFixed(2), commande.numero_table])
          .free();
      }

      // 7. Supprimer les enregistrements associés dans encaisse
      db.prepare("DELETE FROM encaisse WHERE numero_comande = ?")
        .run([numero_comande])
        .free();

      // 8. Supprimer les lignes de attache
      db.prepare("DELETE FROM attache WHERE numero_comande = ?")
        .run([numero_comande])
        .free();

      // 9. Supprimer la commande
      db.prepare("DELETE FROM comande WHERE numero_comande = ?")
        .run([numero_comande])
        .free();

      db.run("COMMIT");
      saveDbToLocalStorage(db);

      console.log(`Vente annulée: numero_comande=${numero_comande}, ${lignes.length} lignes`);
      return { statut: "Vente annulée", status: 200 };

    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }

  } catch (error) {
    console.error("Erreur annulerVente:", error);
    return { error: error.message || "Erreur lors de l'annulation de la vente", status: 500 };
  }
}

export async function annulerReception(data) {
  try {
    console.log("Exécution de annulerReception avec data:", data);
    const db = await getDb();

    // 1. Validation des données - mêmes clés que Flask
    if (!data || !data.numero_mouvement || !data.password2) {
      return { error: "Numéro de mouvement ou mot de passe manquant", status: 400 };
    }

    const numero_mouvement = parseInt(data.numero_mouvement);
    const password2 = data.password2;

    if (isNaN(numero_mouvement)) {
      return { error: "Format invalide pour numero_mouvement", status: 400 };
    }

    if (typeof password2 !== 'string' || !password2.trim()) {
      return { error: "Mot de passe invalide", status: 400 };
    }

    db.run("BEGIN TRANSACTION");

    try {
      // 2. Vérifier l'existence du mouvement et récupérer le numero_util
      const stmtMouvement = db.prepare(`
        SELECT numero_four, numero_util 
        FROM mouvement 
        WHERE numero_mouvement = ? AND nature = 'Bon de réception'
      `);
      stmtMouvement.bind([numero_mouvement]);
      const mouvement = stmtMouvement.step() ? stmtMouvement.getAsObject() : null;
      stmtMouvement.free();

      if (!mouvement) {
        return { error: "Mouvement non trouvé", status: 404 };
      }

      // 3. Vérifier le mot de passe de l'utilisateur
      const stmtUser = db.prepare("SELECT password2 FROM utilisateur WHERE numero_util = ?");
      stmtUser.bind([mouvement.numero_util]);
      const utilisateur = stmtUser.step() ? stmtUser.getAsObject() : null;
      stmtUser.free();

      if (!utilisateur) {
        return { error: "Utilisateur associé au mouvement non trouvé", status: 400 };
      }

      if (utilisateur.password2 !== password2) {
        return { error: "Mot de passe incorrect", status: 401 };
      }

      // 4. Récupérer les lignes de la réception
      const stmtLignes = db.prepare(`
        SELECT numero_item, qtea, nprix 
        FROM attache2 
        WHERE numero_mouvement = ?
      `);
      stmtLignes.bind([numero_mouvement]);
      
      let ligne;
      const lignes = [];
      while (stmtLignes.step()) {
        ligne = stmtLignes.getAsObject();
        lignes.push(ligne);
      }
      stmtLignes.free();

      if (lignes.length === 0) {
        return { error: "Aucune ligne de réception trouvée", status: 404 };
      }

      // 5. Calculer le coût total de la réception
      const totalCout = lignes.reduce((sum, ligne) => {
        return sum + (parseFloat(ligne.qtea || 0) * parseFloat(ligne.nprix || 0));
      }, 0);

      // 6. Restaurer le stock dans item
      for (const ligne of lignes) {
        const stmtItem = db.prepare("SELECT qte FROM item WHERE numero_item = ?");
        stmtItem.bind([ligne.numero_item]);
        const item = stmtItem.step() ? stmtItem.getAsObject() : null;
        stmtItem.free();

        if (item) {
          const nouvelleQte = parseInt(item.qte) - parseInt(ligne.qtea);
          db.prepare("UPDATE item SET qte = ? WHERE numero_item = ?")
            .run([nouvelleQte, ligne.numero_item])
            .free();
        }
      }

      // 7. Mettre à jour le solde du fournisseur
      const stmtFournisseur = db.prepare("SELECT solde FROM fournisseur WHERE numero_fou = ?");
      stmtFournisseur.bind([mouvement.numero_four]);
      const fournisseur = stmtFournisseur.step() ? stmtFournisseur.getAsObject() : null;
      stmtFournisseur.free();

      if (!fournisseur) {
        throw new Error(`Fournisseur ${mouvement.numero_four} non trouvé`);
      }

      const nouveauSolde = parseFloat(fournisseur.solde || 0) + totalCout;
      db.prepare("UPDATE fournisseur SET solde = ? WHERE numero_fou = ?")
        .run([nouveauSolde.toFixed(2), mouvement.numero_four])
        .free();

      // 8. Supprimer les lignes de attache2
      db.prepare("DELETE FROM attache2 WHERE numero_mouvement = ?")
        .run([numero_mouvement])
        .free();

      // 9. Supprimer le mouvement
      db.prepare("DELETE FROM mouvement WHERE numero_mouvement = ?")
        .run([numero_mouvement])
        .free();

      db.run("COMMIT");
      saveDbToLocalStorage(db);

      console.log(`Réception annulée: numero_mouvement=${numero_mouvement}, ${lignes.length} lignes`);
      return { statut: "Réception annulée", status: 200 };

    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }

  } catch (error) {
    console.error("Erreur annulerReception:", error);
    return { error: error.message || "Erreur lors de l'annulation de la réception", status: 500 };
  }
}
# Endpoint: Modifier une vente

@app.route('/modifier_vente/<int:numero_comande>', methods=['PUT'])
def modifier_vente(numero_comande):
    data = request.get_json()
    if not data or 'lignes' not in data or not data['lignes'] or 'numero_util' not in data or 'password2' not in data:
        logger.error("Données de vente invalides")
        return jsonify({"error": "Données de vente invalides, utilisateur ou mot de passe manquant"}), 400

    numero_table = int(data.get('numero_table', 0))
    date_comande = data.get('date_comande', datetime.utcnow().isoformat())
    payment_mode = data.get('payment_mode', 'espece')
    amount_paid = to_dot_decimal(data.get('amount_paid', '0,00'))  # Convertit en float avec point
    amount_paid_str = to_comma_decimal(amount_paid)  # Convertit en string avec virgule
    lignes = data['lignes']
    numero_util = data.get('numero_util')
    password2 = data.get('password2')
    nature = "TICKET" if numero_table == 0 else "BON DE L."

    conn = None
    cur = None
    try:
        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Vérifier l'utilisateur et le mot de passe
        cur.execute("SELECT password2 FROM utilisateur WHERE numero_util = %s", (numero_util,))
        utilisateur = cur.fetchone()
        if not utilisateur or utilisateur['password2'] != password2:
            logger.error(f"Utilisateur {numero_util} ou mot de passe incorrect")
            return jsonify({"error": "Utilisateur ou mot de passe incorrect"}), 401

        # Vérifier l'existence de la commande
        cur.execute("SELECT numero_table FROM comande WHERE numero_comande = %s", (numero_comande,))
        commande = cur.fetchone()
        if not commande:
            logger.error(f"Commande {numero_comande} non trouvée")
            return jsonify({"error": "Commande non trouvée"}), 404

        # Restaurer le solde client si paiement à terme et numero_table != 0
        if commande['numero_table'] != 0:
            cur.execute("SELECT solde FROM client WHERE numero_clt = %s", (commande['numero_table'],))
            old_client = cur.fetchone()
            if old_client and old_client['solde']:
                old_solde = to_dot_decimal(old_client['solde'])
                cur.execute("UPDATE client SET solde = %s WHERE numero_clt = %s",
                            (to_comma_decimal(0), commande['numero_table']))

        # Restaurer le stock des anciens articles
        cur.execute("SELECT numero_item, quantite FROM attache WHERE numero_comande = %s", (numero_comande,))
        old_lignes = cur.fetchall()
        for ligne in old_lignes:
            cur.execute("UPDATE item SET qte = qte + %s WHERE numero_item = %s",
                        (ligne['quantite'], ligne['numero_item']))

        # Supprimer les anciennes lignes et l'entrée encaisse
        cur.execute("DELETE FROM attache WHERE numero_comande = %s", (numero_comande,))
        cur.execute("DELETE FROM encaisse WHERE numero_comande = %s", (numero_comande,))

        # Mettre à jour la commande
        cur.execute("""
            UPDATE comande 
            SET numero_table = %s, date_comande = %s, nature = %s, numero_util = %s
            WHERE numero_comande = %s
        """, (numero_table, date_comande, nature, numero_util, numero_comande))

        # Insérer les nouvelles lignes et ajuster le stock
        total_vente = 0.0
        for ligne in lignes:
            quantite = to_dot_decimal(ligne.get('quantite', '1'))
            remarque = to_dot_decimal(ligne.get('remarque', '0,00'))  # Prix unitaire
            prixt = to_dot_decimal(ligne.get('prixt', '0,00'))  # Total de la ligne
            total_vente += quantite * remarque  # Calcul avec prix unitaire

            # Conversion pour stockage avec virgule
            prixt_str = to_comma_decimal(prixt)
            prixbh_str = to_comma_decimal(to_dot_decimal(ligne.get('prixbh', '0,00')))

            # Gestion de la remarque
            remarque_str = ligne.get('remarque', '')
            if isinstance(remarque_str, (int, float)):
                remarque_str = to_comma_decimal(remarque_str)
            elif isinstance(remarque_str, str) and any(c.isdigit() for c in remarque_str):
                try:
                    if '.' in remarque_str or ',' in remarque_str:
                        remarque_str = to_comma_decimal(to_dot_decimal(remarque_str))
                except ValueError:
                    pass  # Garder la valeur originale si la conversion échoue

            cur.execute("""
                INSERT INTO attache (numero_comande, numero_item, quantite, prixt, remarque, prixbh, achatfx, send)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (numero_comande, ligne.get('numero_item'), quantite, prixt_str,
                  remarque_str, prixbh_str, 0, True))
            cur.execute("UPDATE item SET qte = qte - %s WHERE numero_item = %s",
                        (quantite, ligne.get('numero_item')))

        # Insertion dans encaisse
        total_vente_str = to_comma_decimal(total_vente)
        montant_reglement = total_vente if payment_mode == 'espece' else amount_paid
        montant_reglement_str = to_comma_decimal(montant_reglement)
        solde_restant = total_vente - amount_paid if payment_mode == 'a_terme' else 0.0
        solde_restant_str = to_comma_decimal(solde_restant)

        cur.execute("""
            INSERT INTO encaisse (
                apaye, reglement, tva, ht, 
                numero_comande, origine, time_enc, soldeR
            ) VALUES (
                %s, %s, %s, %s, 
                %s, %s, %s, %s
            )
        """, (
            total_vente_str,        # apaye stocké avec virgule
            montant_reglement_str,  # reglement stocké avec virgule
            '0,00',                 # TVA (ajuste si nécessaire)
            total_vente_str,        # HT = total_vente
            numero_comande,
            nature,
            datetime.now(),
            solde_restant_str       # Solde restant avec virgule
        ))

        # Mise à jour du solde client si à terme
        if payment_mode == 'a_terme' and numero_table != 0:
            cur.execute("""
                UPDATE client SET solde = solde + %s 
                WHERE numero_clt = %s
            """, (solde_restant_str, numero_table))

        conn.commit()
        logger.info(f"Vente modifiée: numero_comande={numero_comande}, {len(lignes)} lignes")
        return jsonify({
            "numero_comande": numero_comande,
            "statut": "Vente modifiée",
            "total_vente": total_vente_str,  # Renvoyé avec virgule
            "montant_verse": amount_paid_str,  # Renvoyé avec virgule
            "reglement": montant_reglement_str,  # Renvoyé avec virgule
            "solde_restant": solde_restant_str if payment_mode == 'a_terme' else "0,00"
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Erreur modification vente: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# Endpoint: Récupérer une vente
@app.route('/vente/<int:numero_comande>', methods=['GET'])
def get_vente(numero_comande):
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Récupérer les détails de la commande
        cur.execute("""
            SELECT c.numero_comande, c.numero_table, c.date_comande, c.nature, c.numero_util,
                   cl.nom AS client_nom, u.nom AS utilisateur_nom
            FROM comande c
            LEFT JOIN client cl ON c.numero_table = cl.numero_clt
            LEFT JOIN utilisateur u ON c.numero_util = u.numero_util
            WHERE c.numero_comande = %s
        """, (numero_comande,))
        commande = cur.fetchone()

        if not commande:
            logger.error(f"Commande {numero_comande} non trouvée")
            return jsonify({"error": "Commande non trouvée"}), 404

        # Récupérer les lignes de la commande
        cur.execute("""
            SELECT a.numero_item, a.quantite, a.prixt, a.remarque, a.prixbh, i.designation
            FROM attache a
            JOIN item i ON a.numero_item = i.numero_item
            WHERE a.numero_comande = %s
        """, (numero_comande,))
        lignes = cur.fetchall()

        # Formater la réponse
        response = {
            'numero_comande': commande['numero_comande'],
            'numero_table': commande['numero_table'],
            'date_comande': commande['date_comande'].isoformat(),
            'nature': commande['nature'],
            'client_nom': commande['client_nom'] or 'Comptoir',
            'utilisateur_nom': commande['utilisateur_nom'] or 'N/A',
            'lignes': [
                {
                    'numero_item': ligne['numero_item'],
                    'designation': ligne['designation'],
                    'quantite': ligne['quantite'],
                    'prixt': str(ligne['prixt']),
                    'remarque': ligne['remarque'] or '',
                    'prixbh': str(ligne['prixbh'])
                }
                for ligne in lignes
            ]
        }

        cur.close()
        conn.close()
        logger.info(f"Vente récupérée: numero_comande={numero_comande}")
        return jsonify(response), 200

    except Exception as e:
        if conn:
            cur.close()
            conn.close()
        logger.error(f"Erreur récupération vente: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Endpoint: Récupérer une réception
@app.route('/reception/<int:numero_mouvement>', methods=['GET'])
def get_reception(numero_mouvement):
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Récupérer les détails du mouvement
        cur.execute("""
            SELECT m.numero_mouvement, m.numero_four, m.date_m, m.nature, m.numero_util,
                   f.nom AS fournisseur_nom, u.nom AS utilisateur_nom
            FROM mouvement m
            LEFT JOIN fournisseur f ON m.numero_four = f.numero_fou
            LEFT JOIN utilisateur u ON m.numero_util = u.numero_util
            WHERE m.numero_mouvement = %s AND m.nature = 'Bon de réception'
        """, (numero_mouvement,))
        mouvement = cur.fetchone()

        if not mouvement:
            logger.error(f"Mouvement {numero_mouvement} non trouvé")
            return jsonify({"error": "Mouvement non trouvé"}), 404

        # Récupérer les lignes du mouvement
        cur.execute("""
            SELECT a2.numero_item, a2.qtea, a2.nprix, a2.nqte, a2.pump, i.designation
            FROM attache2 a2
            JOIN item i ON a2.numero_item = i.numero_item
            WHERE a2.numero_mouvement = %s
        """, (numero_mouvement,))
        lignes = cur.fetchall()

        # Formater la réponse
        response = {
            'numero_mouvement': mouvement['numero_mouvement'],
            'numero_four': mouvement['numero_four'],
            'date_m': mouvement['date_m'].isoformat(),
            'nature': mouvement['nature'],
            'fournisseur_nom': mouvement['fournisseur_nom'] or 'N/A',
            'utilisateur_nom': mouvement['utilisateur_nom'] or 'N/A',
            'lignes': [
                {
                    'numero_item': ligne['numero_item'],
                    'designation': ligne['designation'],
                    'qtea': ligne['qtea'],
                    'nprix': str(ligne['nprix']),
                    'nqte': ligne['nqte'],
                    'pump': str(ligne['pump'])
                }
                for ligne in lignes
            ]
        }

        cur.close()
        conn.close()
        logger.info(f"Réception récupérée: numero_mouvement={numero_mouvement}")
        return jsonify(response), 200

    except Exception as e:
        if conn:
            cur.close()
            conn.close()
        logger.error(f"Erreur récupération réception: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Endpoint: Modifier une réception

@app.route('/modifier_reception/<int:numero_mouvement>', methods=['PUT'])
def modifier_reception(numero_mouvement):
    data = request.get_json()
    if not data or 'lignes' not in data or not data['lignes'] or 'numero_four' not in data or 'numero_util' not in data or 'password2' not in data:
        logger.error("Données de réception invalides")
        return jsonify({"error": "Données de réception invalides, fournisseur, utilisateur ou mot de passe manquant"}), 400

    numero_four = data.get('numero_four')
    numero_util = data.get('numero_util')
    password2 = data.get('password2')
    lignes = data['lignes']

    conn = None
    try:
        conn = get_conn()
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Vérifier l'utilisateur et le mot de passe
        cur.execute("SELECT Password2 FROM utilisateur WHERE numero_util = %s", (numero_util,))
        utilisateur = cur.fetchone()
        if not utilisateur:
            logger.error(f"Utilisateur {numero_util} non trouvé")
            return jsonify({"error": "Utilisateur non trouvé"}), 400
        if utilisateur['password2'] != password2:
            logger.error(f"Mot de passe incorrect pour l'utilisateur {numero_util}")
            return jsonify({"error": "Mot de passe incorrect"}), 401

        # Vérifier le fournisseur
        cur.execute("""
            SELECT numero_fou, CAST(COALESCE(NULLIF(REPLACE(solde, ',', '.'), ''), '0') AS FLOAT) AS solde 
            FROM fournisseur WHERE numero_fou = %s
        """, (numero_four,))
        fournisseur = cur.fetchone()
        if not fournisseur:
            logger.error(f"Fournisseur {numero_four} non trouvé")
            return jsonify({"error": "Fournisseur non trouvé"}), 400

        # Vérifier que la réception existe
        cur.execute("SELECT numero_mouvement, numero_four FROM mouvement WHERE numero_mouvement = %s", 
                    (numero_mouvement,))
        mouvement = cur.fetchone()
        if not mouvement:
            logger.error(f"Réception {numero_mouvement} non trouvée")
            return jsonify({"error": "Réception non trouvée"}), 404

        # Récupérer les lignes précédentes de la réception (quantités et prix)
        cur.execute("""
            SELECT numero_item, qtea, CAST(COALESCE(NULLIF(REPLACE(nprix, ',', '.'), ''), '0') AS FLOAT) AS nprix
            FROM attache2
            WHERE numero_mouvement = %s
        """, (numero_mouvement,))
        old_lines = cur.fetchall()
        old_lines_dict = {line['numero_item']: line for line in old_lines}
        old_total_cost = sum(float(line['qtea']) * float(line['nprix']) for line in old_lines)
        logger.info(f"Coût total réception précédente: {old_total_cost}")

        # Restaurer le solde initial (annuler l'effet de la réception précédente)
        current_solde = float(fournisseur['solde'] or 0)
        restored_solde = current_solde + old_total_cost
        logger.info(f"Solde restauré: {restored_solde}")

        # Récupérer les quantités actuelles des articles
        item_ids = list(set([ligne.get('numero_item') for ligne in lignes] + list(old_lines_dict.keys())))
        cur.execute("""
            SELECT numero_item, qte, CAST(COALESCE(NULLIF(REPLACE(prixba, ',', '.'), ''), '0') AS FLOAT) AS prixba 
            FROM item WHERE numero_item IN %s
        """, (tuple(item_ids),))
        items = {item['numero_item']: item for item in cur.fetchall()}

        # Calculer le nouveau coût total et préparer les mises à jour du stock
        new_total_cost = 0.0
        stock_updates = {}  # {numero_item: {old_qtea, new_qtea, prixbh}}

        for ligne in lignes:
            numero_item = ligne.get('numero_item')
            new_qtea = to_dot_decimal(ligne.get('qtea', '0'))
            prixbh = to_dot_decimal(ligne.get('prixbh', '0'))

            if new_qtea < 0:
                raise Exception("La quantité ajoutée ne peut pas être négative")
            if prixbh < 0:
                raise Exception("Le prix d'achat ne peut pas être négatif")

            # Vérifier l'article
            item = items.get(numero_item)
            if not item:
                raise Exception(f"Article {numero_item} non trouvé")

            current_qte = float(item['qte'] or 0)
            old_qtea = float(old_lines_dict.get(numero_item, {}).get('qtea', 0))

            # Calculer le coût de la ligne
            new_total_cost += new_qtea * prixbh

            # Stocker les informations pour la mise à jour du stock
            stock_updates[numero_item] = {
                'old_qtea': old_qtea,
                'new_qtea': new_qtea,
                'prixbh': prixbh,
                'current_qte': current_qte,
                'current_prixba': float(item['prixba'] or 0)
            }

        # Traiter les articles supprimés (présents dans old_lines mais absents dans lignes)
        for numero_item, old_line in old_lines_dict.items():
            if numero_item not in stock_updates:
                item = items.get(numero_item)
                current_qte = float(item['qte'] or 0) if item else 0
                current_prixba = float(item['prixba'] or 0) if item else 0
                stock_updates[numero_item] = {
                    'old_qtea': float(old_line['qtea']),
                    'new_qtea': 0,
                    'prixbh': 0,
                    'current_qte': current_qte,
                    'current_prixba': current_prixba
                }

        # Mettre à jour le solde du fournisseur
        new_solde = restored_solde - new_total_cost
        new_solde_str = to_comma_decimal(new_solde)
        cur.execute("UPDATE fournisseur SET solde = %s WHERE numero_fou = %s", 
                    (new_solde_str, numero_four))
        logger.info(f"Solde fournisseur mis à jour: numero_fou={numero_four}, new_total_cost={new_total_cost}, new_solde={new_solde_str}")

        # Supprimer les anciennes lignes de la réception
        cur.execute("DELETE FROM attache2 WHERE numero_mouvement = %s", (numero_mouvement,))

        # Insérer les nouvelles lignes et mettre à jour le stock
        for numero_item, update_info in stock_updates.items():
            old_qtea = update_info['old_qtea']
            new_qtea = update_info['new_qtea']
            prixbh = update_info['prixbh']
            current_qte = update_info['current_qte']
            current_prixba = update_info['current_prixba']

            # Restaurer le stock initial (annuler l'ancienne quantité)
            restored_qte = current_qte - old_qtea
            # Appliquer la nouvelle quantité
            new_qte = restored_qte + new_qtea

            if new_qte < 0:
                raise Exception(f"Stock négatif pour l'article {numero_item}: {new_qte}")

            # Si l'article est dans les nouvelles lignes, insérer dans attache2
            if new_qtea > 0:
                prixbh_str = to_comma_decimal(prixbh)[:30]
                cur.execute("""
                    INSERT INTO attache2 (numero_item, numero_mouvement, qtea, nqte, nprix, pump, send)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (numero_item, numero_mouvement, new_qtea, new_qte, prixbh_str, prixbh_str, True))

            # Mettre à jour le stock et le prix d'achat
            cur.execute("UPDATE item SET qte = %s, prixba = %s WHERE numero_item = %s", 
                        (new_qte, to_comma_decimal(prixbh)[:30] if new_qtea > 0 else to_comma_decimal(current_prixba)[:30], 
                         numero_item))
            logger.info(f"Stock mis à jour: numero_item={numero_item}, old_qtea={old_qtea}, new_qtea={new_qtea}, new_qte={new_qte}")

        # Mettre à jour le mouvement
        cur.execute("""
            UPDATE mouvement 
            SET numero_four = %s, numero_util = %s, date_m = %s
            WHERE numero_mouvement = %s
        """, (numero_four, numero_util, datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0), numero_mouvement))

        conn.commit()
        logger.info(f"Réception modifiée: numero_mouvement={numero_mouvement}, {len(lignes)} lignes")
        return jsonify({
            "numero_mouvement": numero_mouvement,
            "total_cost": to_comma_decimal(new_total_cost),
            "new_solde": new_solde_str
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Erreur modification réception: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            cur.close()
            conn.close()
# Endpoint: Liste des catégories
@app.route('/liste_categories', methods=['GET'])
def liste_categories():
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT numer_categorie, description_c FROM categorie ORDER BY description_c")
        categories = cur.fetchall()
        cur.close()
        conn.close()
        logger.info(f"Récupération de {len(categories)} catégories")
        return jsonify(categories), 200
    except Exception as e:
        logger.error(f"Erreur récupération catégories: {str(e)}")
        return jsonify({'erreur': str(e)}), 500

# Endpoint: Ajouter une catégorie
@app.route('/ajouter_categorie', methods=['POST'])
def ajouter_categorie():
    data = request.get_json()
    description_c = data.get('description_c')
    if not description_c:
        logger.error("Description requise pour ajouter une catégorie")
        return jsonify({'erreur': 'Description requise'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO categorie (description_c) VALUES (%s) RETURNING numer_categorie",
            (description_c,)
        )
        category_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"Catégorie ajoutée: id={category_id}, description={description_c}")
        return jsonify({'statut': 'Catégorie ajoutée', 'id': category_id}), 201
    except Exception as e:
        logger.error(f"Erreur ajout catégorie: {str(e)}")
        return jsonify({'erreur': str(e)}), 500

# Endpoint: Modifier une catégorie
@app.route('/modifier_categorie/<int:numer_categorie>', methods=['PUT'])
def modifier_categorie(numer_categorie):
    data = request.get_json()
    description_c = data.get('description_c')
    if not description_c:
        logger.error("Description requise pour modifier une catégorie")
        return jsonify({'erreur': 'Description requise'}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE categorie SET description_c = %s WHERE numer_categorie = %s RETURNING numer_categorie",
            (description_c, numer_categorie)
        )
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            logger.error(f"Catégorie {numer_categorie} non trouvée")
            return jsonify({'erreur': 'Catégorie non trouvée'}), 404
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"Catégorie modifiée: numer_categorie={numer_categorie}")
        return jsonify({'statut': 'Catégorie modifiée'}), 200
    except Exception as e:
        logger.error(f"Erreur modification catégorie: {str(e)}")
        return jsonify({'erreur': str(e)}), 500

# Endpoint: Supprimer une catégorie
@app.route('/supprimer_categorie/<int:numer_categorie>', methods=['DELETE'])
def supprimer_categorie(numer_categorie):
    try:
        conn = get_conn()
        cur = conn.cursor()
        # Vérifier si la catégorie est utilisée par des produits
        cur.execute("SELECT 1 FROM item WHERE numero_categorie = %s", (numer_categorie,))
        if cur.fetchone():
            cur.close()
            conn.close()
            logger.error(f"Catégorie {numer_categorie} utilisée par des produits")
            return jsonify({'erreur': 'Catégorie utilisée par des produits'}), 400
        cur.execute("DELETE FROM categorie WHERE numer_categorie = %s", (numer_categorie,))
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            logger.error(f"Catégorie {numer_categorie} non trouvée")
            return jsonify({'erreur': 'Catégorie non trouvée'}), 404
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"Catégorie supprimée: numer_categorie={numer_categorie}")
        return jsonify({'statut': 'Catégorie supprimée'}), 200
    except Exception as e:
        logger.error(f"Erreur suppression catégorie: {str(e)}")
        return jsonify({'erreur': str(e)}), 500

# Endpoint: Assigner une catégorie à un produit
@app.route('/assigner_categorie', methods=['POST'])
def assigner_categorie():
    try:
        data = request.get_json()
        if not data:
            logger.error("Données JSON manquantes dans la requête")
            return jsonify({'erreur': 'Données JSON requises'}), 400

        numero_item = data.get('numero_item')
        numero_categorie = data.get('numer_categorie')

        logger.debug(f"Requête reçue: numero_item={numero_item}, numer_categorie={numero_categorie}")

        if numero_item is None:
            logger.error("numero_item manquant dans la requête")
            return jsonify({'erreur': 'Numéro d\'article requis'}), 400

        try:
            numero_item = int(numero_item)
        except (ValueError, TypeError) as e:
            logger.error(f"numero_item invalide: {numero_item}, erreur: {str(e)}")
            return jsonify({'erreur': 'Numéro d\'article doit être un entier'}), 400

        if numero_categorie is not None:
            try:
                numero_categorie = int(numero_categorie)
            except (ValueError, TypeError) as e:
                logger.error(f"numero_categorie invalide: {numero_categorie}, erreur: {str(e)}")
                return jsonify({'erreur': 'Numéro de catégorie doit être un entier'}), 400

        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            "SELECT numero_item, designation FROM item WHERE numero_item = %s",
            (numero_item,)
        )
        item = cur.fetchone()
        if not item:
            logger.error(f"Article non trouvé: numero_item={numero_item}")
            cur.close()
            conn.close()
            return jsonify({'erreur': f'Article {numero_item} non trouvé'}), 404

        if numero_categorie is not None:
            cur.execute(
                "SELECT numer_categorie, description_c FROM categorie WHERE numer_categorie = %s",
                (numero_categorie,)
            )
            category = cur.fetchone()
            if not category:
                logger.error(f"Catégorie non trouvée: numer_categorie={numero_categorie}")
                cur.close()
                conn.close()
                return jsonify({'erreur': f'Catégorie {numero_categorie} non trouvée'}), 404

        cur.execute(
            "UPDATE item SET numero_categorie = %s WHERE numero_item = %s RETURNING numero_categorie",
            (numero_categorie, numero_item)
        )
        updated = cur.fetchone()
        if cur.rowcount == 0:
            logger.error(f"Aucun article mis à jour: numero_item={numero_item}")
            cur.close()
            conn.close()
            return jsonify({'erreur': 'Aucun article mis à jour, vérifiez les données'}), 404

        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"Catégorie assignée: numero_item={numero_item}, numer_categorie={numero_categorie}")
        return jsonify({
            'statut': 'Catégorie assignée',
            'numero_item': numero_item,
            'numer_categorie': numero_categorie
        }), 200

    except Exception as e:
        logger.error(f"Erreur dans assigner_categorie: {str(e)}", exc_info=True)
        if 'conn' in locals() and conn:
            conn.rollback()
            cur.close()
            conn.close()
        return jsonify({'erreur': f'Erreur serveur: {str(e)}'}), 500

# Endpoint: Liste des produits par catégorie
@app.route('/liste_produits_par_categorie', methods=['GET'])
def liste_produits_par_categorie():
    try:
        numero_categorie = request.args.get('numero_categorie', type=int)
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if numero_categorie is None and 'numero_categorie' in request.args:
            cur.execute(
                "SELECT numero_item, designation FROM item WHERE numero_categorie IS NULL"
            )
            produits = cur.fetchall()
            cur.close()
            conn.close()
            logger.info(f"Récupération de {len(produits)} produits sans catégorie")
            return jsonify({'produits': produits}), 200
        else:
            cur.execute("""
                SELECT c.numer_categorie, c.description_c, i.numero_item, i.designation
                FROM categorie c
                LEFT JOIN item i ON c.numer_categorie = i.numero_categorie
                WHERE c.numer_categorie = %s OR %s IS NULL
            """, (numero_categorie, numero_categorie))
            rows = cur.fetchall()
            categories = {}
            for row in rows:
                cat_id = row['numer_categorie']
                if cat_id not in categories:
                    categories[cat_id] = {'numero_categorie': cat_id, 'description_c': row['description_c'], 'produits': []}
                if row['numero_item']:
                    categories[cat_id]['produits'].append({
                        'numero_item': row['numero_item'],
                        'designation': row['designation']
                    })
            cur.close()
            conn.close()
            logger.info(f"Récupération de {len(categories)} catégories avec produits")
            return jsonify({'categories': list(categories.values())}), 200
    except Exception as e:
        logger.error(f"Erreur dans liste_produits_par_categorie: {str(e)}", exc_info=True)
        if 'conn' in locals() and conn:
            cur.close()
            conn.close()
        return jsonify({'erreur': str(e)}), 500

if __name__ == "__main__":
    import sys
    cli = sys.modules.get('flask.cli')
    if cli:
        cli.show_server_banner = lambda *args, **kwargs: None
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False, ssl_context=('cert.pem','key.pem'))
