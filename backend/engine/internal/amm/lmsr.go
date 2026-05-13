package amm

import (
	"math"
)

// CalculateCost computes the total cost function for an LMSR AMM
// C = b * ln(e^(q_yes/b) + e^(q_no/b))
func CalculateCost(qYes, qNo, bParameter float64) float64 {
	if bParameter <= 0 {
		return math.NaN()
	}

	a := qYes / bParameter
	b := qNo / bParameter
	m := math.Max(a, b)
	// log-sum-exp trick prevents overflow for large exponent inputs.
	return bParameter * (m + math.Log(math.Exp(a-m)+math.Exp(b-m)))
}

// CalculatePrice computes the instantaneous price of a given outcome
// P_yes = e^(q_yes/b) / (e^(q_yes/b) + e^(q_no/b))
func CalculatePrice(qYes, qNo, bParameter float64, isYes bool) float64 {
	if bParameter <= 0 {
		return math.NaN()
	}

	// Use stable logistic form.
	delta := (qYes - qNo) / bParameter
	var pYes float64
	if delta >= 0 {
		e := math.Exp(-delta)
		pYes = 1.0 / (1.0 + e)
	} else {
		e := math.Exp(delta)
		pYes = e / (1.0 + e)
	}

	if isYes {
		return pYes
	}
	return 1.0 - pYes
}

// CalculateCostForShares calculates the exact cost for purchasing `deltaShares` of an outcome
// Cost = C(q_yes + delta, q_no) - C(q_yes, q_no)
func CalculateCostForShares(qYes, qNo, bParameter, deltaShares float64, isYes bool) float64 {
	initialCost := CalculateCost(qYes, qNo, bParameter)
	
	var finalCost float64
	if isYes {
		finalCost = CalculateCost(qYes+deltaShares, qNo, bParameter)
	} else {
		finalCost = CalculateCost(qYes, qNo+deltaShares, bParameter)
	}
	
	return finalCost - initialCost
}
