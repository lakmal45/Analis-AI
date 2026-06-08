import csv

wins = 0
losses = 0
total = 0

try:
    with open('app/ml/data/training-data.csv', 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            label = row.get('label', '')
            if label == '1':
                wins += 1
            elif label == '0':
                losses += 1

    print(f"Total rows: {total}")
    print(f"Wins: {wins}")
    print(f"Losses: {losses}")

    if total < 60:
        print("Error: less than 60 rows")
    if wins == 0 or losses == 0:
        print("Error: missing WIN or LOSS classes")
    if wins < 10 or losses < 10:
        print("Error: need at least 10 WIN and 10 LOSS")
except Exception as e:
    print("Exception:", e)
